/* =============================================================
   Feedback widget
   -------------------------------------------------------------
   Top-bar "Feedback" button + popup. Submissions POST to a Cloudflare
   Worker (see worker/feedback-worker.js), which appends each one to
   feedback/feedback.json in this GitHub repo. A weekly GitHub Action
   (.github/workflows/weekly-feedback-summary.yml) summarizes that file
   with Claude and emails the digest — see that workflow + the README
   note at the bottom of this file for the one-time setup steps.
   ============================================================= */

// Fill this in after deploying the Cloudflare Worker (see worker/README
// in the setup instructions) — looks like
// "https://orbital-sim-feedback.<your-subdomain>.workers.dev".
// Until set, the form shows a friendly "not configured yet" message
// instead of failing silently.
const FEEDBACK_ENDPOINT = '';

(function () {
  const btn      = document.getElementById('btnFeedback');
  const popup    = document.getElementById('feedback-popup');
  const textarea = document.getElementById('feedback-text');
  const honeypot = document.getElementById('feedback-hp');
  const sendBtn  = document.getElementById('btnFeedbackSend');
  const cancelBtn = document.getElementById('btnFeedbackCancel');
  const statusEl = document.getElementById('feedback-status');

  function closePopup() {
    popup.style.display = 'none';
    statusEl.textContent = '';
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const opening = popup.style.display !== 'block';
    popup.style.display = opening ? 'block' : 'none';
    if (opening) { statusEl.textContent = ''; textarea.focus(); }
  });

  cancelBtn.addEventListener('click', closePopup);

  document.addEventListener('click', e => {
    if (popup.style.display === 'block' && !popup.contains(e.target) && e.target.id !== 'btnFeedback') {
      closePopup();
    }
  });

  sendBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) { statusEl.style.color = '#f66'; statusEl.textContent = 'Type something first.'; return; }

    if (!FEEDBACK_ENDPOINT) {
      statusEl.style.color = '#fa0';
      statusEl.textContent = 'Feedback backend not configured yet — see worker/ setup instructions.';
      return;
    }

    sendBtn.disabled = true;
    statusEl.style.color = '#8cf';
    statusEl.textContent = 'Sending…';

    try {
      const resp = await fetch(FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          hp: honeypot.value,        // honeypot — bots tend to fill hidden fields
          page: location.href,
          ua: navigator.userAgent.slice(0, 200),
        }),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);

      statusEl.style.color = '#0f8';
      statusEl.textContent = 'Thanks! Added to this week\'s feedback.';
      textarea.value = '';
      setTimeout(closePopup, 1600);
    } catch (err) {
      statusEl.style.color = '#f66';
      statusEl.textContent = 'Failed to send — try again in a moment.';
    } finally {
      sendBtn.disabled = false;
    }
  });
})();
