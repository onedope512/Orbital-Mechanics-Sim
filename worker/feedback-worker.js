/**
 * Cloudflare Worker — feedback intake endpoint.
 *
 * Receives POST { text, hp, page, ua } from the site's feedback popup
 * (js/13-feedback.js) and appends each submission as a JSON record to
 * feedback/feedback.json in the GitHub repo, via the GitHub Contents API.
 * A weekly GitHub Action (.github/workflows/weekly-feedback-summary.yml)
 * reads that file, summarizes it, emails the digest, then clears it.
 *
 * Required secrets/vars (see worker/README.md for setup steps):
 *   GH_TOKEN  (secret) — fine-grained GitHub PAT, Contents: Read & Write
 *                         on this repo only.
 *   GH_OWNER  (var)    — repo owner, e.g. "nikhil9206"
 *   GH_REPO   (var)    — repo name,  e.g. "Orbital-Mechanics-Sim"
 */

const FEEDBACK_PATH = 'feedback/feedback.json';
const MAX_TEXT_LEN  = 4000;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const text = String(body.text || '').trim().slice(0, MAX_TEXT_LEN);
    const honeypot = String(body.hp || '').trim();

    // Honeypot field is hidden via CSS — real users never fill it in.
    // Bots that blindly fill every form field will, so we silently
    // pretend success without actually storing anything.
    if (honeypot) return json({ ok: true });

    if (!text) return json({ error: 'Empty feedback' }, 400);

    const entry = {
      id:   crypto.randomUUID(),
      ts:   new Date().toISOString(),
      text,
      page: String(body.page || '').slice(0, 300),
      ua:   String(body.ua   || '').slice(0, 200),
    };

    try {
      await appendFeedback(env, entry);
    } catch (err) {
      return json({ error: 'Storage failed: ' + err.message }, 502);
    }

    return json({ ok: true });
  },
};

async function appendFeedback(env, entry) {
  const apiUrl = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${FEEDBACK_PATH}`;
  const headers = {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    'User-Agent': 'orbital-sim-feedback-worker',
    Accept: 'application/vnd.github+json',
  };

  // Fetch the current file (if any) to get its sha + existing entries.
  let sha, entries = [];
  const getResp = await fetch(apiUrl, { headers });
  if (getResp.status === 200) {
    const data = await getResp.json();
    sha = data.sha;
    entries = JSON.parse(decodeBase64(data.content) || '[]');
  } else if (getResp.status !== 404) {
    throw new Error(`GitHub GET ${getResp.status}`);
  }

  entries.push(entry);

  const putResp = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Feedback: ${entry.id}`,
      content: encodeBase64(JSON.stringify(entries, null, 2)),
      sha, // omitted (undefined) on first-ever submission, which creates the file
    }),
  });
  if (!putResp.ok) {
    throw new Error(`GitHub PUT ${putResp.status}: ${await putResp.text()}`);
  }
}

function decodeBase64(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  return btoa(String.fromCharCode(...bytes));
}

function corsHeaders() {
  return {
    // Submissions carry no auth/cookies, so a wildcard origin is fine —
    // tighten to the site's exact origin here if you want to be stricter.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
