# Wera for Chrome

[![CI](https://github.com/jessechumo/wera-extension/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jessechumo/wera-extension/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/jessechumo/wera-extension/badges/coverage.json)](https://github.com/jessechumo/wera-extension/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jessechumo/wera-extension?sort=semver&display_name=tag)](https://github.com/jessechumo/wera-extension/releases)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](manifest.json)
[![Tested with Playwright](https://img.shields.io/badge/e2e-Playwright-2EAD33?logo=playwright&logoColor=white)](e2e)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org)

A Chrome extension for [Wera](https://github.com/jessechumo/Wera): on any job page, save the job to your Wera lists, see how well it fits, write a cover letter, tailor your resume and fill in the application. **Wera never submits an application.** It fills what it knows, outlines what you should check, and you click Submit yourself.

## What it does

- **Job:** reads the posting from the page's schema.org `JobPosting` data (Greenhouse, Lever, Ashby, Workday and most career sites publish it) or, failing that, with the AI from the page text. You review the form and save; the job joins your Jobs and Tracker and gets a fit score. A job already in Wera shows its score, reasons and missing skills, lets you move it through your tracker (saved, applied, interviewing...), and shows the company's certified H-1B filings with what it offered for similar titles. Its fit score also appears on the toolbar icon for that tab. A posting you open from the Wera dashboard is recognized even when the career site's address differs from the one Wera has (the panel says so, with "Not this job?" to undo it).
- **Wera button:** on job postings and application forms (on the sites you allowed, or every common job site at once from Settings) a small **Autofill with Wera** button sits in the corner. One click opens the panel and starts filling; × hides it on that site for a week. Chrome only lets an extension open its side panel from a click, so the button is how Wera "pops up" on a job.
- **Apply, field by field:** Wera reads the form and lists every field with what it would enter and where that came from: your application details, an answer you gave on an earlier form, your resume, your cover letter, or the AI. Nothing is typed until you press **Fill**: untick anything, pick another option, or type a value. Fields it cannot answer are listed under **Needs you**; consent boxes are never ticked. Filling goes one field at a time and each ticks off in the list as it lands. Under the hood it works out what each field asks (name, contact, links, work authorization and sponsorship, clearance, citizenship, travel, work mode, notice period, education, salary, voluntary self-identification), picks options by meaning ("USA" for United States, "TX" for Texas, "Prefer not to say", "I am not authorized..." as no), handles react-select, Workday's button dropdowns, Ashby's Yes/No buttons, forms embedded from another site and web components, shapes dates and numbers, attaches the best resume PDF, and flags any value a field refuses.
- **Smart answers:** fields your details and earlier answers do not cover go to the AI in one small request per page (from your profile, resume, details and earlier answers; never your self-identification). Sure answers are ticked, guesses are shown for you to approve. Open questions ("Why do you want to work here?") get a draft sized to the box, or one of your earlier answers to a similar question.
- **Learns:** what you type or choose on a form is saved in Wera (for every browser you connect) and offered the next time a form asks the same thing; details the form needed that Wera lacked go to your application details. Turn it off in Settings; manage saved answers in the dashboard.
- **Multi-page applications:** **Approve & continue** saves what you entered, presses the page's Next / Save and continue button, and fills the next page as soon as it appears (Workday-style steps without a page load, or a new page). It never presses Submit: on the last page it says so and leaves Submit to you. Each application is recorded in Wera (site, pages, fields), shown on the job in the dashboard.
- **Follows the page:** on single-page job boards it follows you to the next posting; after a reload it reads the form again. When the page says the application went through ("Thank you for applying"), it offers to mark the job as applied in your tracker.
- **With the dashboard:** saving a job, tracking it, writing a letter or tailoring a resume in the panel refreshes any open dashboard tab, and changes made in the dashboard show in the panel.
- **Shortcuts:** Alt+Shift+W opens Wera; Alt+Shift+F (or right-click, "Fill this application with Wera") opens it and fills the form. Change them at chrome://extensions/shortcuts.
- **Letter:** writes a cover letter with Wera's letter writer (your profile and resume, this posting, no clichés, no dashes) in the tone and length you choose, stressing what you ask for; edit, copy or insert it into the page. Apply fills it into a cover letter box.
- **Resume and CV:** create your main resume right in the panel (built by the AI from your uploaded file, or started from your details) and edit it there: headline, summary, skills, every entry and bullet (with stronger wordings on request), what shows, and the template, with a live preview, Fit to one page and PDF. For a job, see which of the posting's keywords your resume covers and tailor a one-page copy (optionally telling it what to lead with); edit that copy here too. It is the same document as in the dashboard, and Apply attaches it.
- **Settings:** the gear in the header: the Wera button, access to common job sites in one go, AI suggestions, filling each next page on its own, learning from your answers, your account.

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture-dark.svg">
  <img alt="Wera for Chrome architecture: the side panel reads and fills the job site tab and is opened by the service worker; it calls the Wera API with a bearer token; the API keeps hashed tokens in PostgreSQL and is the only part that calls the LLM API" src="docs/architecture.svg">
</picture>

- `src/content`: injected into the active tab (and its frames) only when you use Wera there. Reads job data and text, plans a form page (every field, what it shows, what Wera would enter and why), fills the approved values reporting each one, reads back what you left for Wera to learn, finds the Next button (never Submit), and watches for new steps, confirmations and in-page navigation. Pure DOM code, unit-tested against fixture forms.
- `src/sidepanel`: the React UI (an extension page). It calls your Wera server with the extension's bearer token.
- `src/launcher`: the Wera button, registered by the background for exactly the sites you allowed (never your Wera server). It tells postings and forms from other pages and sends nothing anywhere.
- `src/background`: opens the side panel from the toolbar icon, the Wera button, the page's right-click menu and the keyboard shortcuts, keeps the button registered for the allowed sites, and ties a tab the dashboard opens to its job.
- `src/bridge`: runs only on your Wera dashboard (registered for the server you signed in to). It passes which job a posting link opens, and "something changed" in both directions.
- `src/shared`: the API client, storage and shared types.

The server side lives in the Wera repository (`/api/ext/*`, `/api/applicant`, `/api/applicant/answers`, `/api/autofill-runs`); the dashboard lists connected browsers under Settings and holds your application details and saved answers under Profile.

## Privacy and permissions

- Permissions: `storage`, `sidePanel`, `activeTab`, `scripting`, `contextMenus`. Site access is **optional**: Wera asks for your server when you sign in and for a job site the first time you use it there (and for the site of a form embedded in it, naming that site).
- The extension talks only to your own Wera server. Your password is sent once to get a token; the token is stored in `chrome.storage.local` and can be revoked in Wera's Settings (changing your password revokes all of them).
- Page text you send to the AI is fenced as untrusted data in every prompt.
- Watching for new form steps, confirmations and in-page navigation happens in the page and sends the side panel only a field count, "submitted" or the new address, never page content.
- The dashboard bridge runs only on your own Wera server's pages and accepts messages only from that origin; it passes job ids and posting addresses, nothing else. The toolbar badge uses jobs the side panel already looked up; nothing else about your browsing is sent anywhere.
- Answers you give on forms are saved to your own Wera server (turn learning off in Settings; forget them there or in the dashboard). Self-identification answers are never learned and never sent to the AI.
- The Wera button runs only on sites you allowed. It looks at the page's fields and job data to decide whether to show itself, and sends nothing.

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

The end-to-end tests load the built extension into Playwright's Chromium, sign in through the UI, save a job read from a fixture page, review and fill its application form (checking that the resume is attached and that the consent box and Submit are left alone), approve a multi-step form through to its last page, fill a form embedded from another site, and check the Wera button.

## Releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org). release-please keeps a release PR with the next version and `CHANGELOG.md`; merging it tags the release and attaches `wera-extension-<version>.zip`, ready to upload to the Chrome Web Store. `npm run package` builds the same zip locally.

## Layout

```
src/content/      page reading (JSON-LD, text), field detection, classification, filling
src/sidepanel/    React side panel: sign in, Job, Apply, Letter, Resume, Settings
src/background/   service worker
src/bridge/       script on the Wera dashboard: job handoffs and change notices
src/launcher/     the Wera button on job sites
src/shared/       API client, storage, types
e2e/              Playwright tests and fixture pages
scripts/          build, package, icons
docs/             architecture diagram (Excalidraw source in docs/diagrams)
```
