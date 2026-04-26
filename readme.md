# Markdown Flashcards

A simple, local-first flashcard app backed entirely by a single Markdown file.

Markdown Flashcards works with a single deck file: `cards.md`. You write fronts and backs in plain Markdown, run the local app, and review in a clean UI. The app automatically updates helpful metadata like difficulty and review dates right back into `cards.md`.

## Features

- **Local-first & private:** Runs completely on your machine. No cloud sync, no tracking, complete data ownership.
- **Plain text source of truth:** Your entire deck lives in a single `cards.md` file. It's easy to read, edit in any editor, and version control.
- **Rich Markdown support:** Build cards using code blocks, lists, tables, and local images.
- **No hidden databases:** Study stats (like difficulty and last-reviewed dates) are saved as YAML frontmatter directly on the cards.
- **Simple configuration:** Control your daily study session with a few straightforward YAML settings at the top of the file.

### Landing Page

![](/assets/app-screenshot-01.png)

### Study Mode

![](/assets/app-screenshot-02.png)

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the app:
   ```bash
   npm start
   ```
3. Open in your browser:
   `http://localhost:54123`

## Writing Cards

At a minimum, each card needs a front and a back wrapped in HTML `<!-- card -->` markers.

```markdown
<!-- card -->

## Front

What does the `===` operator check in JavaScript?

## Back

Strict equality — it compares both value and type.

<!-- /card -->
```

### Card metadata

Once the app has run, cards usually include a YAML metadata block like this:

````markdown
<!-- card -->

```yaml
id: a1b2c3d4
difficulty: 3
last_reviewed: 2026-04-26
paused: no
```

## Front

...
````

These fields are managed entirely by the app, so you don't have to write them yourself:

- `id` — stable card identifier
- `difficulty` — current 1–5 rating
- `last_reviewed` — last date the card was marked reviewed
- `paused` — use `yes` to remove a card from sessions without deleting it

## Configuration

The YAML block at the very top of `cards.md` controls how the next session stack is built. These settings are read when the server starts, so restart the server after editing them and then refresh the page.

````markdown
```yaml
filter_difficulty: [1, 2, 3]
shuffle: yes
exclude_reviewed_today: false
```
````

- `filter_difficulty`: restrict cards to specific difficulty levels.
- `shuffle`: `yes` or `no`.
- `exclude_reviewed_today`: `true` to skip cards already reviewed today when generating the session stack.

> Note: `exclude_reviewed_today` is a session-start filter. Cards reviewed _during_ the current session will stay in the active stack.

## Development & Project Structure

- `public/` — Browser UI (HTML, CSS, JS frontend)
- `src/` — Node.js parser, startup, and session logic
- `test/` — Automated test suite and fixtures
- `assets/` — Local images or other static files referenced by cards
- `logs/` — Run logs created by the app
- `.bak/` — Timestamped backups of your `cards.md` generated automatically

### Helpful commands

- `npm run dev` — start with watch mode
- `npm test` — run the automated test suite

Please read `spec.md` before changing behavior to ensure your changes align with the product and file-format contract.
