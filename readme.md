# Markdown Flashcards

Write your flashcards in Markdown, then study them in a focused local interface.

Markdown Flashcards is built around a single deck file: `cards.md`. You write fronts and backs in plain Markdown, open the app in a browser, and let the app save helpful study metadata like difficulty and review dates back into that same file.

That keeps the workflow simple:

- one source of truth
- no hidden database
- easy editing in any text editor
- deck files that are easy to back up or version control

All you need to run it is Node.js and a browser.

## What you can do with it

- keep your whole deck in `cards.md`
- write card content with normal Markdown, including code blocks, lists, tables, and images
- shape each study session with a few top-of-file settings
- reveal answers, rate difficulty, and mark cards reviewed in the browser
- see where you are in the session along with last-reviewed info and timers
- keep study metadata in the same file instead of scattering it across separate tools

### Guide / start page

![](/assets/app-screenshot-01.png)

### Study session

![](/assets/app-screenshot-02.png)

## What studying looks like

When you open the app, it starts on a short guide page. From there you can jump into study mode and use:

- **Show guide / Hide guide** to reopen or dismiss the guide
- **Show session info / Hide session info** to check the active order, filters, eligible-card count, and reviewed-today count
- a **Current card** summary that shows:
  - position in the session
  - last reviewed value
  - current-card timer
  - overall session timer
- **Previous** and **Next** to move through the current session stack
- **Reveal answer** / **Hide answer** to show the back of the card
- **Difficulty** to rate the current card from `1` to `5`
- **Mark as Reviewed** to set `last_reviewed` to today

### Keyboard shortcuts

- `←` / `→` — previous / next
- `1–5` — set difficulty
- `Space` / `Enter` — reveal or hide the answer
- `R` — toggle reviewed status when undo is available

## Quick start

1. Install dependencies:
   - `npm install`
2. Start the app:
   - `npm start`
3. Open:
   - `http://localhost:54123`
4. Read the guide once, then press **Start studying**.

### Helpful commands

- `npm run dev` — start with watch mode
- `npm test` — run the automated test suite

## Configure the next session in `cards.md`

The YAML block at the very top of `cards.md` controls how the next session stack is built.

````markdown
```yaml
filter_difficulty: [1, 2, 3]
shuffle: yes
exclude_reviewed_today: false
```
````

- `filter_difficulty`
  - include only cards whose difficulty matches the listed values
  - omit it to include all difficulties
- `shuffle`
  - use `yes` for shuffled order
  - use `no` for file order
- `exclude_reviewed_today`
  - defaults to `false`
  - set it to `true` to skip cards that were already reviewed when the session started

### Important note about `exclude_reviewed_today`

This is a **session-start filter**, not a live pruning rule.

That means:

- cards already reviewed **before** the session starts can be excluded
- cards reviewed **during** the current session stay in the active stack

If you change any of these file-level settings, restart the server so the next session picks them up.

## How `cards.md` is structured

At a minimum, each card needs a front and a back.

````markdown
```yaml
shuffle: yes
exclude_reviewed_today: false
```

<!-- card -->

## Front

What does the `===` operator check in JavaScript?

## Back

Strict equality — it compares both value and type.

<!-- /card -->
````

You can keep card bodies simple or use richer Markdown such as:

- lists
- code blocks
- tables
- images from `assets/`

### Card metadata

Once the app has run, cards usually include a YAML metadata block like this:

````markdown
```yaml
id: a1b2c3d4
difficulty: 3
last_reviewed: 2026-04-26
paused: no
```
````

These fields are managed by the app:

- `id` — stable card identifier
- `difficulty` — current 1–5 rating
- `last_reviewed` — last date the card was marked reviewed
- `paused` — use `yes` to remove a card from sessions without deleting it

You can start with simpler cards and let the app fill in missing managed fields on startup.

## What gets saved automatically

- changing **Difficulty** updates that card in `cards.md` immediately
- pressing **Mark as Reviewed** sets `last_reviewed` to today
- the app can undo a review made during the current browser session
- on every server launch, the app creates:
  - a timestamped backup in `.bak/`
  - a run log in `logs/`

## Files you will care about most

- `cards.md` — your deck and its managed metadata
- `assets/` — local images or other static files referenced by cards
- `readme.md` — this overview
- `spec.md` — the exact product and file-format contract

## If you are changing the app itself

If you are editing the codebase rather than just using the app:

1. read `spec.md` before changing behavior
2. keep implementation, tests, and spec in sync
3. use `npm test` before wrapping up a change

### Repository map

- `public/` — browser UI
- `src/` — parser, startup, and session logic
- `test/` — automated tests and fixtures
- `tasks.md` — current work queue
