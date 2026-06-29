#!/usr/bin/env node
/**
 * Weekly feedback summarizer — run by
 * .github/workflows/weekly-feedback-summary.yml on a Monday cron.
 *
 * Reads feedback/feedback.json, asks Claude for a digest, emails it via
 * Resend, then moves the processed entries into feedback/archive.json
 * and empties feedback.json for the next week.
 *
 * Required env vars (set as GitHub Actions repo secrets):
 *   ANTHROPIC_API_KEY
 *   RESEND_API_KEY
 *   FEEDBACK_TO_EMAIL   (plain repo variable is fine too — not secret)
 */

const fs   = require('fs');
const path = require('path');

const ROOT          = path.join(__dirname, '..');
const FEEDBACK_FILE = path.join(ROOT, 'feedback', 'feedback.json');
const ARCHIVE_FILE  = path.join(ROOT, 'feedback', 'archive.json');
const TO_EMAIL       = process.env.FEEDBACK_TO_EMAIL || 'adapalanikhil@gmail.com';

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

async function main() {
  const entries = readJSON(FEEDBACK_FILE, []);

  if (!entries.length) {
    console.log('No feedback submitted this week — skipping email.');
    return;
  }

  console.log(`Summarizing ${entries.length} feedback entr${entries.length === 1 ? 'y' : 'ies'}...`);

  const summary = await summarizeWithClaude(entries);
  await sendEmail(summary, entries);

  // Archive the processed batch, then clear this week's inbox file.
  const archive = readJSON(ARCHIVE_FILE, []);
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive.concat(entries), null, 2) + '\n');
  fs.writeFileSync(FEEDBACK_FILE, '[]\n');

  console.log('Done — email sent, batch archived, inbox cleared.');
}

async function summarizeWithClaude(entries) {
  const listText = entries
    .map((e, i) => `${i + 1}. [${e.ts}] ${e.text}`)
    .join('\n');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{
        role: 'user',
        content:
          `Here is raw user feedback submitted this week for a browser-based ` +
          `3D orbital mechanics simulator (placing planets/stars/black holes, ` +
          `gravity wells, collisions). Write a concise weekly digest covering: ` +
          `1) overall themes and sentiment, 2) the most actionable bugs or ` +
          `feature requests, 3) anything that sounds urgent. Plain text, no ` +
          `markdown headers or bullet symbols, under 300 words.\n\n${listText}`,
      }],
    }),
  });

  if (!resp.ok) {
    throw new Error(`Anthropic API ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.content[0].text;
}

async function sendEmail(summary, entries) {
  const rawList = entries
    .map(e => `<li><b>${escapeHtml(e.ts)}</b>: ${escapeHtml(e.text)}</li>`)
    .join('');

  const html = `
    <h2>Weekly Feedback Summary — Orbital Mechanics Sim</h2>
    <p>${entries.length} submission${entries.length === 1 ? '' : 's'} this week.</p>
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;">${escapeHtml(summary)}</pre>
    <hr>
    <h3>Raw entries</h3>
    <ul>${rawList}</ul>
  `;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      // onboarding@resend.dev works without verifying a custom domain,
      // but only delivers to the email address you signed up to Resend
      // with. Swap in a verified domain sender once you have one.
      from: 'Orbital Sim Feedback <onboarding@resend.dev>',
      to: [TO_EMAIL],
      subject: `Weekly Feedback Summary (${entries.length} submission${entries.length === 1 ? '' : 's'})`,
      html,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Resend API ${resp.status}: ${await resp.text()}`);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
