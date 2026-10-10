# Wera for Chrome: plan

A Chrome extension (Manifest V3) that brings Wera to any job application:
save a job to Wera, see how well it fits, write a cover letter, tailor the
resume, and fill in the application form. The user always reviews and
clicks Submit; Wera never submits on its own (faster than typing, but the
person stays in control, and job sites are not spammed).

## Features

1. **Add a job.** On any job page, the side panel shows a form pre-filled
   with the posting: company, title, location, work mode, salary, URL and
   description. Data comes from the page's schema.org `JobPosting` markup
   when present (Greenhouse, Lever, Ashby, Workday and most career sites
   publish it), otherwise from the AI reading the page text. The user edits
   and saves; the job joins their Wera lists (Jobs, Tracker) and is scored.
2. **Fit.** If the job is known (same URL), show its fit score and reason.
3. **Cover letter.** Generate with the existing Wera cover letter writer
   (same prompt, profile and resume), edit, copy, or insert it into the
   application's cover letter field.
4. **Tailored resume.** The AI rewrites the summary, orders skills and
   rewrites experience bullets toward the posting, never inventing facts;
   shown side by side with what changed; copy or print to PDF.
5. **Autofill.** Detect the application form's fields, classify each one
   (name, email, phone, links, location, work authorization, sponsorship,
   education, salary, start date, voluntary self-identification, ...) and
   fill them from the user's application details; attach the resume PDF;
   draft answers to open questions ("Why us?") with the AI for review.
   Filled fields are highlighted and listed; nothing is submitted.

## Architecture

- **Extension** (this repo): TypeScript, Vite, React for the side panel.
  - `background` service worker: the API client (bearer token) and the
    message router.
  - `sidepanel`: the UI (Job, Apply, Letter, Resume, Account).
  - `content` (injected on demand): page reading (JSON-LD, text) and the
    autofill engine. Pure functions, unit-tested against fixture forms.
- **API** (wera repo), new endpoints under `/api/ext`:
  - `POST /api/ext/tokens` sign in from the extension (email, password)
    and get a long-lived, revocable token; `GET`/`DELETE` list and revoke
    (also in dashboard Settings). Bearer requests skip the cookie origin
    check (a bearer token cannot be sent cross-site by a browser).
  - `GET/PUT /api/applicant`: application details (phone, links, address,
    work authorization answers, education, EEO preferences).
  - `POST /api/ext/extract`: AI reads untrusted page text into job fields.
  - `GET /api/ext/jobs/lookup?url=`: is this job already in Wera?
  - `POST /api/ext/jobs`: add a job (manual company if unknown, deduped by
    URL), saved to the tracker, scored on demand.
  - `POST /api/ext/jobs/{id}/tailored-resume`: tailored resume JSON.
  - `POST /api/ext/answer`: draft an answer to one application question.
  - Cover letters reuse `POST /api/jobs/{id}/cover-letter`.
- **Dashboard**: Settings lists connected extensions (revoke); Profile gets
  an "Application details" form; added jobs are marked "Added by you".

## Permissions and privacy

- `storage`, `sidePanel`, `activeTab`, `scripting`.
- Site access is optional and requested at first use (`https://*/*`), so
  the extension reads a page only when the user opens Wera on it.
- The token lives in `chrome.storage.local`; page text goes only to the
  user's own Wera server; untrusted page text is fenced in every prompt.

## Phases

1. API: tokens and bearer auth, application details, add/lookup job,
   extract, answer, tailored resume (with tests).
2. Extension scaffold: build, manifest, background API client, sign in.
3. Job capture: JSON-LD and text extraction, the add-job form.
4. Autofill engine: field detection, classification, filling, resume
   attachment, question drafts.
5. Letter and resume tabs.
6. Dashboard: connected extensions, application details, added jobs.
7. Tests (unit on fixture forms, e2e with the extension loaded in
   Chromium), CI, release zip, README with an architecture diagram.

Later: ATS-specific adapters for multi-page flows (Workday), a tailored
resume PDF attached automatically, application history per site.
