# OPG recruitment process feedback survey — implementation plan

## Goal and source of truth

Build a separate hiring feedback website from the local `Email-Unsubscribe-Form` reference project. Preserve its OPG branding, splash sequence, centered card, three-segment stepper, custom recruiter dropdown, modal behavior, responsive transitions, same-origin submission path, Vercel function, authenticated n8n workflow, Google Sheets storage, and security controls. Change the complete visual theme to light mode and replace the survey content with the fields below. Show one generic success modal after a confirmed save, regardless of the answers.

The question source is the [Recruitment Process Feedback Form](https://docs.google.com/forms/d/e/1FAIpQLSfIlPaMtJIkudecPpzgE2E62geyzfqBy7TklidMk4YkhKkhGA/viewform), read on 29 October 2026. Recheck it before launch if its owner edits it. Its final “END OF FEEDBACK. Thank you so much!” block is display text, not a response field. The Google Form's current confirmation mentions a course; use a recruitment-specific confirmation on this website.

## Tech stack to carry into the new project

| Layer | Technology from the reference project | Role |
| --- | --- | --- |
| Runtime and package management | Node.js 22, npm, `package-lock.json` | Run builds, workflow generation, and tests with reproducible dependencies. |
| Frontend | Vanilla HTML, CSS, and JavaScript modules | Render the splash, light-theme survey, three-step form, accessible controls, and modals without a UI framework. |
| Build and local development | Vite 8 (`vite` `^8.0.0` in `package.json`) | Serve the site locally, build static assets, and provide the local `/api/submit` adapter. |
| Hosting and server endpoint | Vercel static hosting and a Node.js function at `api/submit.js` | Serve the built `dist` site and validate/forward same-origin submissions. |
| Automation and response storage | n8n webhook, Code, IF, Respond to Webhook, and Google Sheets nodes; Google Sheets `Responses` tab | Revalidate each submission and append or update a response row. |
| Security and abuse controls | Vercel security headers/CSP, Vercel Firewall rate limit, server-only n8n Header Auth secret | Protect the endpoint and keep the webhook secret out of the browser. |
| Testing | Node.js built-in test runner and `playwright-core` (`^1.64.0` in `package.json`) with Chrome | Check payload validation, workflow wiring, build output, and responsive browser behavior. |
| Source control and deployment link | Git and the **Hiring-Process-Survey GitHub repository** connected to Vercel | Preserve its existing history and deploy from `main`. |

Keep the reference project's `package.json` scripts (`dev`, `build`, `preview`, `workflows:build`, `test`, `test:browser`) and rename the package for the hiring survey. Keep the OPG font and image/video assets needed by the design, subject to the same website-use licensing check noted in `README.md`.

## Exact survey content

Use the title **Recruitment Process Feedback Form** and this introduction: “Hi there! Kindly share your feedback on the recruitment process you’ve just completed, including any feedback for how the recruiter can improve efficiency and effectiveness.”

All six fields are required. Preserve the question wording and answer values below. The third scale's source label is spelled **“Excelllent”**; retain it for exact parity unless the form owner corrects the source.

| Step | Field | Exact prompt | Input and allowed values |
| --- | --- | --- | --- |
| 1 — Recruiter | `recruiterName` | Recruiter's Name | Single choice: Ella, Hanna, Allen, Joy, Liz, Paris, Karen, Fia, Glam |
| 2 — Your ratings | `professionalismRating` | 1. Was the recruiter professional and respectful throughout the process? | 1, 2, 3, 4, 5; endpoint labels “Very Poor” and “Excellent” |
| 2 — Your ratings | `roleClarityRating` | 2. Did the recruiter clearly explain the role, requirements, and expectations? | 1, 2, 3, 4, 5; endpoint labels “Very Poor” and “Excellent” |
| 2 — Your ratings | `overallRating` | 3. How would you rate your overall experience with the recruiter? | 1, 2, 3, 4, 5; endpoint labels “Very Poor” and “Excelllent” |
| 3 — Your feedback | `recruiterFeedback` | 4. Feedback regarding your Recruiter's manner of handling your hiring process:<br>- What you liked<br>- What can be improved | Multiline written response |
| 3 — Your feedback | `processImprovements` | 5. What aspects of this hiring process needs improvement? | Multiline written response |

The source form does not ask for the respondent's name or email. Remove the reference project's `name` and `email` fields and related validation rather than silently collecting extra information. Keep the hidden `website` honeypot, which is not a survey question.

## UI and interaction parity

1. Copy the website's structural and interaction pattern from `index.html`, `src/main.js`, `src/styles.css`, and the assets in `public/assets/`. Keep the same OPG logo placement, typography, card shape, gold highlights, pill buttons, progress animations, splash timing and fallbacks, modal animation, focus handling, and keyboard support.
2. Keep **three steps and three progress segments**. Step 1 contains the recruiter selector; step 2 contains the three 1–5 ratings; step 3 contains the two written responses and Submit. Keep Back/Continue navigation and preserve answers when moving backward. Validate the current step before advancing. Make each rating a single-select 1–5 control with visible endpoint labels, an accessible group label, and keyboard operation. Keep the recruiter's choice in the existing custom dropdown pattern.
3. Apply a complete light palette through CSS tokens: light page and splash backgrounds, light card and modal surfaces, dark readable text, visible borders, and the same gold accent. Update hover, focus, selected, disabled, autofill, dropdown, and textarea states. Set the document theme color for light mode. The existing splash MP4s contain a dark background; create light-background versions from the source animation while preserving the four-second sequence and portrait/compact/desktop/wide sizing. Update the fallback images as needed. Avoid a dark flash before or after playback and honor reduced-motion preferences.
4. Keep the pre-submit **Data Privacy Disclaimer** modal and its existing scroll-to-end, acknowledgment checkbox, Cancel, and Confirm and submit behavior. Replace every opt-out, suppression, marketing, and contact-record statement with an accurate explanation of recruitment feedback collection, purpose, Google Workspace storage, staff access, and actual retention. Reset its acknowledgment state each time it opens. The privacy acknowledgment is a submission gate; it is not part of the success modal.
5. Retain notice and error modals for missing answers and failed saves, including the focus trap, Escape/close behavior, and return focus. Show a single success message only after the server confirms the Sheet write: **“Thank you for your feedback. Your response has been saved.”** Remove `confirmationFor()` and all answer-dependent success copy. Do not promise any recruiter or hiring-process action that the workflow does not perform.
6. Adapt the card's content height for three rating groups and two textareas. On short or narrow screens, allow the card's form content to scroll while keeping every field and action reachable; the current fixed-height/hidden-overflow layout must not clip the longer questions. Verify 320×480, 320×568, 390×844, 667×375, and desktop layouts. Keep the modal usable at those sizes too.

## Data contract and automation

Keep this architecture, with a **new hiring-survey n8n workflow and a new Google Sheet**:

```text
Browser → same-origin POST /api/submit → Vercel function → authenticated n8n production webhook → Google Sheets Responses tab
```

The browser sends only the fields in this JSON shape; ratings are strings so the server and n8n can check exact choices:

```json
{
  "requestId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "recruiterName": "Ella",
  "professionalismRating": "5",
  "roleClarityRating": "4",
  "overallRating": "5",
  "recruiterFeedback": "The recruiter explained the timeline clearly.",
  "processImprovements": "A clearer next-step email would help.",
  "website": ""
}
```

The Vercel function derives the retry-stable `responseId` from the request ID **and all answers**, then sends the same response fields plus `responseId` to n8n, without `requestId`. Keep the upstream contract `{ "ok": true, "status": "saved" }`. A successful HTTP status alone must not open the success modal. The n8n workflow validates again, writes one row, and responds only after Google Sheets succeeds.

Use these exact `Responses` columns in this order:

```text
response_id,recruiter_name,professionalism_rating,role_clarity_rating,overall_rating,recruiter_feedback,process_improvements,submitted_at
```

Use **Append or Update Row** matching `response_id`, as in the reference. Generate `submitted_at` in n8n. Sequential identical retries should update the same row; changed answers must get a different response ID. Google Sheets is not a transactional uniqueness store, so simultaneous identical requests may still race.

## Files to adapt in the new project

| Reference file | Hiring survey change |
| --- | --- |
| `index.html` | Light theme metadata and copy; recruiter dropdown; three rating groups; two textareas; generic success text; revised privacy notice. |
| `src/styles.css` | Light palette for every surface and state; preserve layout/motion; add rating and textarea styles and safe scrolling for long content. |
| `src/main.js` | Keep splash, stepper, dropdown, modal, focus, privacy, and submission flow; remap three steps to the six fields; remove answer-based confirmation logic. |
| `src/survey.js` | Replace old answer lists and payload validation with recruiter names, ratings, required feedback, and generic save/error messages. |
| `server/submission.js` | Replace old request keys and validators; retain same-origin/origin, method, content type, size, honeypot, UUID, timeout, authenticated webhook, retry ID, and generic error controls. |
| `api/submit.js`, `vite.config.js` | Retain the Vercel and local adapter pattern; point to the adapted handler. |
| `automation/workflow-logic.js` | Revalidate the new payload; escape formula-like prefixes in **all written fields** before Google Sheets. |
| `automation/build-workflows.mjs` | Generate a new hiring-feedback workflow, unique webhook path, new column mapping, and execution-saving settings; import its generated JSON into n8n. |
| `vercel.json`, `.env.example` | Preserve CSP/security headers and server-only environment-variable names; update site-specific metadata and setup notes. |
| `tests/*.test.js`, `README.md` | Update field fixtures, browser flow, workflow checks, setup instructions, and deployment checklist. |

For the two required written answers, set a clear client and server limit (for example, 4,000 characters per answer), normalize line endings, and allow normal multiline text. Increase the current 4,096-byte request cap to a bounded value that accommodates both answers (for example, 40 KiB) and test UTF-8 input near that limit. Reject extra or missing keys, unsupported recruiter names or ratings, empty feedback, and unsafe control characters. Render user text with text APIs, never as HTML. Escape spreadsheet formula prefixes after trimming/normalization.

## GitHub repository and deployment flow

1. Use the existing **`akizita/Hiring-Process-Survey` GitHub repository** in a separate checkout and put the adapted project in its root. Preserve its initial commit and existing files. Keep its Git history and deployment settings separate from the reference project.
2. Carry over `.gitignore`. Commit source code, assets, tests, the generated n8n workflow template, `package.json`, `package-lock.json`, `.env.example`, and documentation. Keep `.env.local`, real credentials, webhook URLs, Google Sheet exports/responses, `node_modules`, `dist`, and test artifacts out of GitHub. The committed workflow template must contain placeholders, never live credential values.
3. After local checks pass, commit the hiring survey and **push `main` to `https://github.com/akizita/Hiring-Process-Survey.git`**. Confirm the remote points there and the pushed files match the reviewed local build. Push subsequent fixes there as well.
4. Import the **Hiring-Process-Survey repository** into Vercel. Use the Vite framework preset, `npm run build`, and output directory `dist`; retain the `api/submit.js` function. Set the n8n production URL and secret only in Vercel's server-side environment settings. Connect the production deployment to the repository's main branch so pushes deploy the hiring site, then verify the live deployment before sharing its URL.

## Security and account setup

- Keep `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` **server-only** in `.env.local` and Vercel; never add a `VITE_` prefix, client-side webhook URL, or secret to the built site. Use a fresh n8n Header Auth secret of at least 32 characters and a hiring-specific webhook path and credential. Local development may use a listening HTTPS `/webhook-test/` URL; production must use the published HTTPS `/webhook/` URL.
- Keep exact-path, POST-only, same-origin checks; JSON-only and bounded-body handling; strict server validation; honeypot; 10-second upstream timeout; no redirects; no-store responses; generic errors; and fixed-category logs without response text, names, IPs, or secrets. Origin checks and a honeypot are abuse controls, not authentication.
- Preserve `vercel.json` CSP, frame protection, HSTS, referrer, permissions, and no-store API headers. Configure Vercel Firewall's `/api/submit` POST rate limit initially at **10 requests per 10 minutes per IP**, then tune from legitimate traffic and abuse counts.
- Configure the n8n Header Auth credential and new Google Sheets credential/spreadsheet ID after import. Disable saved success, error, and manual n8n executions; check instance-wide overrides and any error workflow. Restrict n8n and Sheet access to staff handling recruitment feedback. Do not place full responses in alerts or logs.
- Keep the reference project's manual Sheet-row retention approach unless the hiring team's actual retention policy differs. Make the privacy notice match the policy and operational reality before launch. Do not carry over the current opt-out notice or its claims.

## Verification and release gate

- [ ] Exact six required fields, prompts, recruiter choices, 1–5 values, and endpoint labels match the linked form; no extra respondent name/email fields.
- [ ] Three-step Back/Continue flow retains answers and blocks incomplete steps; recruiter dropdown, ratings, textareas, and all modals work with keyboard and touch.
- [ ] Light theme covers the splash video/fallback, form, controls, dropdown, privacy modal, error modal, and success modal with readable contrast and no dark flash.
- [ ] On reduced motion, failed video, mobile portrait, mobile landscape, and short screens, all content remains reachable and no horizontal clipping occurs.
- [ ] Privacy scroll/acknowledgment gate works; closing and reopening resets it; the actual submission starts only after confirmation.
- [ ] Empty/invalid/oversized/cross-origin requests fail before n8n; formula-like feedback is stored as text; browser requests contain no webhook URL or secret.
- [ ] Mocked upstream failure shows the retry modal, keeps answers and request ID, and does not show success. A later successful retry writes one row and shows the same generic success message for every rating combination.
- [ ] `npm ci`, `npm test`, `npm run test:browser`, `npm run workflows:build`, and `npm run build` pass in the new project. Update the browser test to cover the longer step content and five reference viewports.
- [ ] The adapted project is committed and pushed to **`akizita/Hiring-Process-Survey`** with no secrets or response data; Vercel is connected to that repository's production branch.
- [ ] Import and publish the new n8n workflow; configure its credentials and new `Responses` Sheet; configure Vercel production environment values and Firewall; deploy over HTTPS.
- [ ] Submit one real test response. Confirm the browser calls only `/api/submit`, the Sheet row exists before success is shown, CSP/security headers are present, and production uses `/webhook/`. Remove the test row afterward.

The new workflow **saves feedback only**. Any later notification, recruiter coaching, or hiring-process follow-up needs its own separately specified automation and truthful user-facing copy.
