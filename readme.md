# Local Markdown Flashcard App

A local-first flashcard app backed by a single Markdown file, `cards.md`. A small Node.js server validates and rewrites that file, serves a plain HTML/CSS/JS study interface, and keeps backups and logs on disk.

### Landing Page

![](/assets/app-screenshot-01.png)

### Study Session

![](/assets/app-screenshot-02.png)

## What the app does

- stores flashcards in `cards.md`
- builds a study session from file-level filters and shuffle settings
- lets the user reveal answers, change difficulty on a 1–5 scale, use keyboard shortcuts, and mark cards as reviewed
- persists card updates back to `cards.md`
- creates a startup backup and run log on every launch

## Quick start

- `npm install` — install dependencies
- `npm start` — run the app
- `npm run dev` — run with watch mode
- `npm test` — run the automated tests

The app serves locally on port `54123`.

## Documentation map

- `readme.md` — project overview, commands, and repository map
- `spec.md` — canonical behavior and file-format contract
- `tasks.md` — live queue of current and upcoming work

## Repository layout

- `cards.md` — flashcard data and runtime source of truth
- `public/` — frontend HTML, CSS, and browser-side JavaScript
- `src/` — parser, startup, and session logic
- `test/` — automated tests and fixtures
- `assets/` — static assets referenced by cards
- `logs/` — per-run log files
- `.bak/` — per-startup backups of `cards.md`

## Working on the project

1. Read `spec.md` before changing behavior.
2. Update implementation and tests together.
3. Keep `tasks.md` focused on what is next, not what is already done.
4. If behavior changes, update `spec.md` in the same change.

## Runtime files

- `cards.md` is the only runtime data store in v1.
- `.bak/` stores timestamped backups created on server startup.
- `logs/` stores timestamped run logs.

## Stack

- Backend: Node.js + Express
- Frontend: plain HTML/CSS/JS
- Markdown rendering: `marked.js` from CDN
- HTML sanitization: `DOMPurify` from CDN
- YAML parsing: `js-yaml`
