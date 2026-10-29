# OPG Recruitment Process Feedback Form

A light-theme, three-step survey for feedback on Outsourced Pro Global's recruitment process. The questions and choices match the [source Google Form](https://docs.google.com/forms/d/e/1FAIpQLSfIlPaMtJIkudecPpzgE2E62geyzfqBy7TklidMk4YkhKkhGA/viewform), checked on 29 October 2026. The form asks for one recruiter, three ratings, and two written answers. It does not ask for the respondent's name or email.

The site keeps the reference project's four-second OPG splash, three-segment progress indicator, custom recruiter dropdown, notice and feedback modals, keyboard focus handling, and responsive layout. Its full heading and introduction remain visible on all three steps. Yellow and orange aurora gradients appear behind the form and throughout the splash, including video playback and its fallback. A blurred, translucent card shows the centered gold glow beneath it. Reduced-motion visitors go straight to the form.

The three 1–5 controls adapt the star preview, lift, tooltip, and selection pop from [React Bits Peek Rating](https://reactbits.dev/c/micro/peek-rating) using the site's existing vanilla JavaScript and native radio inputs. The underlying values, keyboard support, and survey submission format remain 1–5 strings. Reduced-motion visitors see the star state without its movement.

## Architecture

```text
Browser → same-origin POST /api/submit → Vercel function → authenticated n8n webhook → Google Sheets Responses tab
```

The browser sends `requestId`, `recruiterName`, `professionalismRating`, `roleClarityRating`, `overallRating`, `recruiterFeedback`, `processImprovements`, and an empty `website` honeypot. Ratings are strings from `1` through `5`. The two written answers are required, normalized to LF line endings, and limited to 4,000 characters each. The request body is capped at 40 KiB.

The function validates exact keys and values, checks same-origin and request metadata, rejects the honeypot, and derives a retry-stable `responseId` from the request ID and all normalized answers. It forwards only that ID and the answers to n8n. The n8n workflow validates again, escapes formula-like written answers for Sheets, and uses **Append or Update Row** with `response_id` as the match key. It responds `{ "ok": true, "status": "saved" }` only after the Sheets node succeeds. The browser shows the same success modal for every answer combination only after receiving that explicit contract. Sequential identical retries update one row; simultaneous requests can still race in Google Sheets.

The `Responses` tab must have these columns in this exact order:

```text
response_id,recruiter_name,professionalism_rating,role_clarity_rating,overall_rating,recruiter_feedback,process_improvements,submitted_at
```

## Local development

1. Use Node.js 22 and run `npm ci`.
2. Copy `.env.example` to `.env.local`. Set `N8N_WEBHOOK_URL` to a listening HTTPS `/webhook-test/` URL for local development or a published HTTPS `/webhook/` URL. Set `N8N_WEBHOOK_SECRET` to the same fresh random value as the n8n Header Auth credential, at least 32 characters. Do not use a `VITE_` prefix. Production accepts only `/webhook/`.
3. Run `npm run workflows:build`, then `npm run dev`. Vite serves the form and a local `/api/submit` adapter. Restart Vite after changing `.env.local`.
4. Run `npm test`, `npm run test:browser`, and `npm run build`. The browser test uses a local mock workflow and Sheet row store. It does not submit to the real Sheet.

The static `dist` output alone cannot handle submissions; production also needs `api/submit.js` as a Vercel Node.js function.

## Production setup

The repository contains a credential-free workflow template and no live Google Sheet or n8n connection. Complete these account steps before sharing the site:

1. **Create a new Google Sheet** for hiring feedback. Add a `Responses` tab and the exact header row above. Restrict access to staff handling recruitment feedback. Decide whether the stated manual retention practice matches the hiring team's actual policy and update the privacy notice if it does not.
2. **Import `automation/survey-responses.workflow.json` into n8n.** This is a new workflow with path `opg-recruitment-feedback-secure-v1`. Create a new Header Auth credential with name `X-OPG-Survey-Key` and a random secret of at least 32 characters. Attach it to **Survey Webhook**. Attach a Google Sheets credential and replace `REPLACE_WITH_SPREADSHEET_ID` in **Save Response** with the new Sheet ID. Verify **Append or Update Row** matches `response_id` and that **Survey Saved** is reached only after **Save Response**. Keep saved success, error, and manual executions disabled; check instance-wide overrides and any error workflow. Publish the workflow and use its HTTPS **Production URL** (`/webhook/`) for deployment.
3. **Import this repository into Vercel** on the `main` branch using the Vite preset, build command `npm run build`, and output directory `dist`. Keep `api/submit.js` in the project. Set `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` only in Vercel server-side environment variables. Use the published production webhook URL and the same Header Auth secret. Set separate values for Preview only if Preview submissions are intended. Deploy over HTTPS.
4. **Set a Vercel Firewall rule** for `POST /api/submit`: fixed-window rate limit of 10 requests per 10 minutes per IP, returning 429. Review legitimate traffic and abuse counts before tuning it. The function also uses a 10-second upstream timeout, no redirects, a bounded JSON body, generic errors, no-store responses, and fixed-category logs without answers, IPs, or secrets. Origin checks and the honeypot are abuse controls, not user authentication.
5. **Verify the live flow.** Submit one test response through the deployed site. Check that the browser calls only `/api/submit`, the row exists in the new Sheet before success appears, the endpoint returns the explicit saved contract, the webhook URL uses `/webhook/`, and CSP and other security headers are present. Delete the test row afterward. Do not treat local mock tests as proof of a live Sheet write.

The privacy modal says that responses remain in the Sheet until authorized staff manually delete them. There is no automatic deletion job in this project. Limit n8n and Sheet access accordingly, and avoid placing response contents in alerts or logs.

## Splash assets

`public/assets/` contains four light-background H.264 versions of the OPG animation: 540×960 portrait, 960×540 compact, 1280×720 desktop, and 1720×720 wide. The browser selects one at page load and keeps it playing through viewport changes. A light poster and an ink-and-gold logo fallback avoid a dark flash if video loading fails. Reduced-motion visitors skip playback.

The outputs are generated from `Asset/OPG_AfterFX.mov` with `scripts/build-light-splash.mjs`. To regenerate them, install FFmpeg and run `node scripts/build-light-splash.mjs`; set `FFMPEG_PATH` if `ffmpeg` is not on `PATH`. The Heavitas font bundled in `public/assets/fonts/` may require a separate website-use license; confirm that license before public launch.
