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
- **Apply:** finds the form's fields, works out what each asks (name, contact, links, work authorization and sponsorship, relocation, education, experience, salary, start date, voluntary self-identification) and fills them from your application details. It attaches the best resume PDF (the copy tailored to this job, else your main Wera resume, else your uploaded file), picks options by meaning ("USA" for United States, "TX" for Texas, "Prefer not to say", "I am not authorized..." as no), and handles custom dropdowns: react-select, Workday's button dropdowns and Ashby's Yes/No buttons. It works inside forms embedded from another site (a careers page showing its Greenhouse or Lever form in a frame) and inside web components, fills fields that appear after an answer ("If yes...") or load late (states after the country), shapes dates and numbers for their fields, and flags any value a field refuses instead of calling it filled. A detail the form needs that Wera lacks can be added right in the panel: it is saved to your application details and the form is filled again. Open questions ("Why do you want to work here?") get an AI draft, sized to the box and written for this posting (even before you save it), that you edit and insert; answers you insert are remembered in this browser and offered the next time a form asks something similar.
- **Follows the page:** on Workday-style forms where each step replaces the last without a page load, Wera notices the new fields and offers **Fill this step**; on single-page job boards it follows you to the next posting; after a reload empties a form it filled, it offers **Fill again**. When the page says the application went through ("Thank you for applying"), it offers to mark the job as applied in your tracker.
- **With the dashboard:** saving a job, tracking it, writing a letter or tailoring a resume in the panel refreshes any open dashboard tab, and changes made in the dashboard show in the panel.
- **Shortcuts:** Alt+Shift+W opens Wera; Alt+Shift+F (or right-click, "Fill this application with Wera") opens it and fills the form. Change them at chrome://extensions/shortcuts.
- **Letter:** writes a cover letter with Wera's letter writer (your profile and resume, this posting, no clichés, no dashes), which you can edit, copy or insert into the page.
- **Resume:** shows which of the posting's keywords your Wera resume covers and tailors a one-page copy for this job (skills reordered, bullets reworded from your real experience only; missing requirements are listed, never invented). It is the same document as in the dashboard: preview it here, edit it in Wera, or download the PDF.

## Architecture

![Wera for Chrome architecture: job site tab with an on-demand content script, the side panel and service worker in the browser; the Wera API, PostgreSQL and the inference API on your server](docs/architecture.svg)

- `src/content`: injected into the active tab (and its frames) only when you use Wera there. Reads job data and text, finds and labels fields, fills them, and watches for new steps, confirmations and in-page navigation. Pure DOM code, unit-tested against fixture forms.
- `src/sidepanel`: the React UI (an extension page). It calls your Wera server with the extension's bearer token.
- `src/background`: opens the side panel from the toolbar icon, the page's right-click menu and the keyboard shortcuts, and ties a tab the dashboard opens to its job.
- `src/bridge`: runs only on your Wera dashboard (registered for the server you signed in to). It passes which job a posting link opens, and "something changed" in both directions.
- `src/shared`: the API client, storage and shared types.

The server side lives in the Wera repository (`/api/ext/*`, `/api/applicant`); the dashboard lists connected browsers under Settings and holds your application details under Profile.

## Privacy and permissions

- Permissions: `storage`, `sidePanel`, `activeTab`, `scripting`, `contextMenus`. Site access is **optional**: Wera asks for your server when you sign in and for a job site the first time you use it there (and for the site of a form embedded in it, naming that site).
- The extension talks only to your own Wera server. Your password is sent once to get a token; the token is stored in `chrome.storage.local` and can be revoked in Wera's Settings (changing your password revokes all of them).
- Page text you send to the AI is fenced as untrusted data in every prompt.
- Watching for new form steps, confirmations and in-page navigation happens in the page and sends the side panel only a field count, "submitted" or the new address, never page content.
- The dashboard bridge runs only on your own Wera server's pages and accepts messages only from that origin; it passes job ids and posting addresses, nothing else. The toolbar badge uses jobs the side panel already looked up; nothing else about your browsing is sent anywhere.
- Remembered answers stay in `chrome.storage.local` on this computer; the Apply tab can forget them all.

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

The end-to-end tests load the built extension into Playwright's Chromium, sign in through the UI, save a job read from a fixture page, then fill its application form, checking that the resume is attached and that the consent box and Submit are left alone.

## Releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org). release-please keeps a release PR with the next version and `CHANGELOG.md`; merging it tags the release and attaches `wera-extension-<version>.zip`, ready to upload to the Chrome Web Store. `npm run package` builds the same zip locally.

## Layout

```
src/content/      page reading (JSON-LD, text), field detection, classification, filling
src/sidepanel/    React side panel: sign in, Job, Apply, Letter, Resume
src/background/   service worker
src/bridge/       script on the Wera dashboard: job handoffs and change notices
src/shared/       API client, storage, types
e2e/              Playwright tests and fixture pages
scripts/          build, package, icons
docs/             architecture diagram (generated from docs/diagrams)
```
