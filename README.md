# Wera for Chrome

[![CI](https://github.com/jessechumo/wera-extension/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jessechumo/wera-extension/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/jessechumo/wera-extension/badges/coverage.json)](https://github.com/jessechumo/wera-extension/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jessechumo/wera-extension?sort=semver&display_name=tag)](https://github.com/jessechumo/wera-extension/releases)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](manifest.json)
[![Tested with Playwright](https://img.shields.io/badge/e2e-Playwright-2EAD33?logo=playwright&logoColor=white)](e2e)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org)

A Chrome extension for [Wera](https://github.com/jessechumo/Wera): on any job page, save the job to your Wera lists, see how well it fits, write a cover letter, tailor your resume and fill in the application. **Wera never submits an application.** It fills what it knows, outlines what you should check, and you click Submit yourself.

## What it does

- **Job:** tells a job page from any other by its address (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, Rippling, Oracle, iCIMS, LinkedIn, Indeed, Glassdoor and more), its schema.org `JobPosting` data, or what is on it (a title, an Apply button, a description with requirements). It reads the posting from that job data or, on a page without it (LinkedIn, Indeed, a company's own site), with the AI at once; if the AI cannot read it, you type the details in. You review the form and save; the job joins your Jobs and Tracker and gets a fit score. A job already in Wera shows its score, reasons and missing skills, lets you move it through your tracker (saved, applied, interviewing...), and shows the company's certified H-1B filings with what it offered for similar titles. Its fit score also appears on the toolbar icon for that tab. A posting you open from the Wera dashboard is recognized even when the career site's address differs from the one Wera has (the panel says so, with "Not this job?" to undo it).
- **Wera dock:** on job postings and application forms a Wera card slides in at the right of the page: the job, your fit score, its tracker status and whether you autofilled it, a big **Autofill application** button on forms (**Save to Wera** on a posting Wera does not have), and **Cover letter** and **Tailor resume**. Each opens the side panel at that view (Chrome only lets an extension open its side panel from a click). – shrinks it to a tab on the edge; × hides it on that site for a week.
- **Apply, field by field:** **Autofill application** reads the form and fills every field Wera is sure of at once; or **Review the fields first** lists every field with what it would enter and where that came from (your application details, an answer you gave on an earlier form, your resume, your cover letter, or the AI) and nothing is typed until you press **Autofill**: untick anything, pick another option, or type a value. Fields it cannot answer are listed under **Needs you**; consent boxes are never ticked. Filling goes one field at a time and each ticks off in the list as it lands. Autofill fills what Wera knows at once and asks the AI about the rest afterwards. Under the hood it works out what each field asks (name, contact, links, work authorization and sponsorship, clearance, citizenship, travel, work mode, notice period, education, salary, voluntary self-identification), picks options by meaning ("USA" for United States, "TX" for Texas, "Prefer not to say", "I am not authorized..." as no), handles react-select, Workday's button dropdowns, search prompts and month/year boxes, Ashby's Yes/No buttons, place searches (Lever, Google Places), forms embedded from another site and web components, shapes dates and numbers, attaches the best resume PDF, and flags any value a field refuses.
- **One Wera:** the side panel and the dock on job pages use the dashboard's design (logo, Geist, colors, buttons, badges) and follow the theme picked in the dashboard (system, light or dark).
- **Smart answers:** fields your details and earlier answers do not cover go to the AI in one small request per page (from your profile, resume, details and earlier answers; never your self-identification). Sure answers are ticked, guesses are shown for you to approve. Open questions ("Why do you want to work here?") get a draft sized to the box, or one of your earlier answers to a similar question.
- **Learns:** what you type or choose on a form is saved in Wera (for every browser you connect) and offered the next time a form asks the same thing; details the form needed that Wera lacked go to your application details, including gender, race, veteran and disability answers you give on a form (saved in the dashboard's values when you fill or move the form on, never sent to the AI). Self-identification Wera does not have yet is asked, never declined for you. Turn it off in Settings; manage saved answers in the dashboard.
- **Multi-page applications:** **Approve & continue** saves what you entered, presses the page's Next / Save and continue button, and fills the next page as soon as it appears (Workday-style steps without a page load, or a new page). It never presses Submit: on the last page it says so and leaves Submit to you. Each application is recorded in Wera (site, pages, fields), shown on the job in the dashboard.
- **Shows up in Wera:** a job you fill an application for is saved to your Wera lists first if it was not there (from the page's job data or the posting the tab showed before), joins your tracker, and is marked **Autofilled** in the dashboard. Wera also adds a job you save to its own jobs, scores it for other people it suits and starts watching the employer's job board.
- **Marks it applied:** when the site says the application went through ("Thank you for applying") on a tab where you had the form open, the job moves to **Applied** in your tracker and a message on the page says so, with an undo. A job Wera does not have can be added as applied from that message. Turn it off in Settings.
- **Follows the page:** on single-page job boards it follows you to the next posting; after a reload it reads the form again.
- **With the dashboard:** saving a job, tracking it, writing a letter or tailoring a resume in the panel refreshes any open dashboard tab, and changes made in the dashboard show in the panel.
- **Shortcuts:** Alt+Shift+W opens Wera; Alt+Shift+F (or right-click, "Fill this application with Wera") opens it and fills the form. Change them at chrome://extensions/shortcuts.
- **Letter:** writes a cover letter with Wera's letter writer (your profile and resume, this posting, no clichés, no dashes) in the tone and length you choose, stressing what you ask for; edit or copy it, open it as a PDF, or **Add to application**: into the form's cover letter box, or attached as a PDF to its cover letter upload. Autofill does the same, and a form asking for a letter before you wrote one offers **Write my cover letter** right there.
- **Resume and CV:** create your main resume right in the panel (built by the AI from your uploaded file, or started from your details) and edit it there: headline, summary, skills, every entry and bullet (with stronger wordings on request), what shows, and the template, with a live preview, Fit to one page and PDF. For a job, see which of the posting's keywords your resume covers and tailor a one-page copy (optionally telling it what to lead with); edit that copy here too. It is the same document as in the dashboard; Autofill attaches it, or **Attach to application** puts it in the form's resume upload.
- **Settings:** the gear in the header: the dock, marking jobs applied on submit, AI suggestions, filling each next page on its own, learning from your answers, your account.

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture-dark.svg">
  <img alt="Wera for Chrome architecture: the side panel reads and fills the job site tab and is opened by the service worker; it calls the Wera API with a bearer token; the API keeps hashed tokens in PostgreSQL and is the only part that calls the LLM API" src="docs/architecture.svg">
</picture>

- `src/content`: injected into the active tab (and its frames) only when you use Wera there. Reads job data and text, plans a form page (every field, what it shows, what Wera would enter and why), fills the approved values reporting each one, reads back what you left for Wera to learn, finds the Next button (never Submit), and watches for new steps, confirmations and in-page navigation. Pure DOM code, unit-tested against fixture forms.
- `src/sidepanel`: the React UI (an extension page). It calls your Wera server with the extension's bearer token.
- `src/launcher`: the Wera dock, on every page's top frame (never your Wera server). It tells postings and forms from other pages (`src/content/detect.ts`), shows the dock on them and watches for the confirmation after you submit.
- `src/background`: opens the side panel from the toolbar icon, the dock, the page's right-click menu and the keyboard shortcuts; answers the dock (looks the page's job up in Wera, saves a posting, marks a job applied); and ties a tab the dashboard opens to its job.
- `src/bridge`: runs only on your Wera dashboard (registered for the server you signed in to). It passes which job a posting link opens, and "something changed" in both directions.
- `src/shared`: the API client, storage and shared types.

The server side lives in the Wera repository (`/api/ext/*`, `/api/applicant`, `/api/applicant/answers`, `/api/autofill-runs`); the dashboard lists connected browsers under Settings and holds your application details and saved answers under Profile.

## Privacy and permissions

- Permissions: `storage`, `sidePanel`, `activeTab`, `scripting`, `contextMenus`, and access to the sites you visit (Chrome shows it as "read and change all your data on all websites"). Wera needs it to tell a job page from any other on its own and to fill forms there, including forms embedded from another site. On other pages it only checks, in the page, whether they are one.
- The extension talks only to your own Wera server. Your password is sent once to get a token; the token is stored in `chrome.storage.local` and can be revoked in Wera's Settings (changing your password revokes all of them).
- Page text you send to the AI is fenced as untrusted data in every prompt.
- Watching for new form steps, confirmations and in-page navigation happens in the page and sends the side panel only a field count, "submitted" or the new address, never page content.
- On a job page, the dock sends your Wera server the page's address (and, on a posting, its schema.org job data) to look the job up; on a page that says your application went through, its address. Other pages send nothing.
- The dashboard bridge runs only on your own Wera server's pages and accepts messages only from that origin; it passes job ids and posting addresses, nothing else. The toolbar badge uses jobs the side panel already looked up; nothing else about your browsing is sent anywhere.
- Answers you give on forms are saved to your own Wera server (turn learning off in Settings; forget them there or in the dashboard). Self-identification answers are never learned and never sent to the AI.

## Install (development)

```sh
npm install
npm run build          # dist/
```

Open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and choose `dist/`. Pin Wera, open a job page, click the Wera icon and sign in with your Wera address (for example `http://192.168.4.68:3000`).

`npm run dev` rebuilds on change.

## Quality checks

```sh
npm run lint        # ESLint, no warnings allowed
npm run typecheck
npm test            # Vitest: autofill engine on fixture forms, API client, side panel flows
npm run coverage
npm run e2e         # the real extension in Chromium against a Wera API (see playwright.config.ts)
WERA_E2E_AI=1 npm run e2e   # also drafts an answer, writes a letter and tailors a resume with the live AI
```

The end-to-end tests load the built extension into Playwright's Chromium, sign in through the UI, save a job read from a fixture page, review and fill its application form (checking that the resume is attached and that the consent box and Submit are left alone), approve a multi-step form through to its last page, fill a form embedded from another site, check that submitting moves the job to Applied on its own, and check the dock.

## Releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org). release-please keeps a release PR with the next version and `CHANGELOG.md`; merging it tags the release and attaches `wera-extension-<version>.zip`, ready to upload to the Chrome Web Store. `npm run package` builds the same zip locally.

## Layout

```
src/content/      page reading (JSON-LD, text), field detection, classification, filling
src/sidepanel/    React side panel: sign in, Job, Apply, Letter, Resume, Settings
src/background/   service worker
src/bridge/       script on the Wera dashboard: job handoffs and change notices
src/launcher/     the Wera dock on job pages
src/shared/       API client, storage, types
e2e/              Playwright tests and fixture pages
scripts/          build, package, icons
docs/             architecture diagram (Excalidraw source in docs/diagrams)
```
