# Feedback backend — one-time setup

Three free accounts, ~15 minutes total. None of these steps can be done
by Claude on your behalf — they involve logging into your own accounts.

## 1. Deploy the Cloudflare Worker

```bash
cd worker
npm install -g wrangler   # if you don't have it
wrangler login            # opens a browser to sign into (or create) a free Cloudflare account
wrangler secret put GH_TOKEN
# Paste a GitHub fine-grained PAT when prompted — create one at
# github.com/settings/tokens?type=beta with:
#   Repository access: only this repo (Orbital-Mechanics-Sim)
#   Permissions: Contents → Read and write
wrangler deploy
```

`wrangler deploy` prints your Worker's URL, something like:
`https://orbital-sim-feedback.<your-subdomain>.workers.dev`

## 2. Wire the URL into the site

Open `js/13-feedback.js` and set:

```js
const FEEDBACK_ENDPOINT = 'https://orbital-sim-feedback.<your-subdomain>.workers.dev';
```

Commit and push — GitHub Pages picks it up automatically.

## 3. Set up Resend (sends the weekly email)

1. Sign up free at [resend.com](https://resend.com) using **adapalanikhil@gmail.com**
   (the sandbox sender `onboarding@resend.dev` only delivers to the email
   you signed up with — no domain verification needed for this volume).
2. Create an API key in the Resend dashboard.
3. In the GitHub repo: **Settings → Secrets and variables → Actions →
   New repository secret** → name it `RESEND_API_KEY`, paste the key.

## 4. Set up the Anthropic API key (writes the summary)

1. Get a key at [console.anthropic.com](https://console.anthropic.com)
   (pay-per-use; a weekly digest costs a fraction of a cent).
2. Add it as a repo secret named `ANTHROPIC_API_KEY` (same Settings page
   as step 3).

## 5. Test it

In the GitHub repo's **Actions** tab, open "Weekly Feedback Summary" and
click **Run workflow** to trigger it manually instead of waiting for
Monday. Submit a piece of test feedback through the site first so
there's something to summarize.

## How it all fits together

```
Feedback button (index.html)
  → POST js/13-feedback.js
    → Cloudflare Worker (worker/feedback-worker.js)
      → appends to feedback/feedback.json via GitHub API
        → every Monday: .github/workflows/weekly-feedback-summary.yml
          → scripts/summarize-feedback.js
            → Claude API writes the digest
            → Resend emails it to adapalanikhil@gmail.com
            → entries moved to feedback/archive.json, feedback.json cleared
```
