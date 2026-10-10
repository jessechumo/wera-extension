# Wera for Chrome

[![CI](https://github.com/jessechumo/wera-extension/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jessechumo/wera-extension/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/jessechumo/wera-extension/badges/coverage.json)](https://github.com/jessechumo/wera-extension/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jessechumo/wera-extension?sort=semver&display_name=tag)](https://github.com/jessechumo/wera-extension/releases)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](manifest.json)
[![Tested with Playwright](https://img.shields.io/badge/e2e-Playwright-2EAD33?logo=playwright&logoColor=white)](e2e)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org)

A Chrome extension for [Wera](https://github.com/jessechumo/Wera): on any job page, save the job to your Wera lists, see how well it fits, write a cover letter, tailor your resume and fill in the application. **Wera never submits an application.** It fills what it knows, outlines what you should check, and you click Submit yourself.

## What it does

- **Job:** reads the posting from the page's schema.org `JobPosting` data (Greenhouse, Lever, Ashby, Workday and most career sites publish it) or, failing that, with the AI from the page text. You review the form and save; the job joins your Jobs and Tracker and gets a fit score. A job already in Wera shows its score, reasons and missing skills.
- **Apply:** finds the form's fields, works out what each asks (name, contact, links, work authorization and sponsorship, relocation, education, experience, salary, start date, voluntary self-identification) and fills them from your application details. It attaches your resume PDF, picks options by meaning ("USA" for United States, "TX" for Texas, "Prefer not to say"), and handles custom dropdowns. Open questions ("Why do you want to work here?") get an AI draft you edit and insert.
- **Letter:** writes a cover letter with Wera's letter writer (your profile and resume, this posting, no clichés, no dashes), which you can edit, copy or insert into the page.
- **Resume:** rewrites your resume toward the posting from your real experience only; lines citing numbers that are not in your resume are removed, and missing requirements are listed instead of invented. Print it to PDF or copy it.

## Architecture

![Wera for Chrome architecture: job site tab with an on-demand content script, the side panel and service worker in the browser; the Wera API, PostgreSQL and the inference API on your server](docs/architecture.svg)

- `src/content`: injected into the active tab only when you use Wera there. Reads job data and text, finds and labels fields, fills them. Pure DOM code, unit-tested against fixture forms.
- `src/sidepanel`: the React UI (an extension page). It calls your Wera server with the extension's bearer token.
- `src/background`: opens the side panel from the toolbar icon and the page's right-click menu.
- `src/shared`: the API client, storage and shared types.

The server side lives in the Wera repository (`/api/ext/*`, `/api/applicant`); the dashboard lists connected browsers under Settings and holds your application details under Profile.

## Privacy and permissions

- Permissions: `storage`, `sidePanel`, `activeTab`, `scripting`, `contextMenus`. Site access is **optional**: Wera asks for your server when you sign in and for a job site the first time you use it there.
- The extension talks only to your own Wera server. Your password is sent once to get a token; the token is stored in `chrome.storage.local` and can be revoked in Wera's Settings (changing your password revokes all of them).
- Page text you send to the AI is fenced as untrusted data in every prompt.

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
src/shared/       API client, storage, types
e2e/              Playwright tests and fixture pages
scripts/          build, package, icons
docs/             architecture diagram (generated from docs/diagrams)
```
