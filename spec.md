# Local Markdown Flashcard App Specification

This file is the canonical specification for the project.

## 1. Purpose and scope

The app is a local-first flashcard system backed by a single Markdown file, `cards.md`. A local Node.js server serves the frontend and manages reading and writing that file.

The v1 scope is intentionally narrow:

- single user
- single machine
- local data only
- no authentication
- no external backend services
- no database beyond `cards.md`

## 2. System overview

- **Backend:** Node.js + Express
- **Frontend:** single-page HTML/CSS/JS served by the Node server
- **Markdown rendering:** `marked.js` loaded from CDN
- **HTML sanitization:** `DOMPurify` loaded from CDN
- **Diagram rendering:** Mermaid loaded from CDN and applied after Markdown render
- **Math rendering:** KaTeX loaded from CDN and applied after Markdown render
- **Data store:** `cards.md`
- **Port:** `54123`
- **Backups:** `.bak/`, one timestamped backup per server launch
- **Logs:** `logs/`, one timestamped human-readable log file per server run
- **YAML parsing:** `js-yaml`
- **Dev mode:** `node --watch server.js`

## 3. Core concepts

- **Cards file:** `cards.md` is the canonical storage for card content and managed per-card metadata.
- **Managed metadata:** the app manages `id`, `difficulty`, and `last_reviewed` for each card.
- **Skip via difficulty `0`:** difficulty `0` means the card is skipped until the user includes `0` in the live difficulty filter again.
- **Runtime settings:** the browser owns live session settings such as order, reviewed visibility, and visible difficulty levels.
- **Visible session:** the active session is the ordered subset of cards that matches the current runtime settings.
- **Reviewed today:** the count of cards in the whole deck whose `last_reviewed` value matches today.

## 4. Data model and file format

### 4.1 No file-level session settings

`cards.md` no longer stores session configuration at file scope. Runtime settings live in the UI.

Legacy top-of-file YAML blocks may still be present in older decks. The parser may ignore a legacy top YAML block on read, but that block is not part of the active model and is dropped on rewrite.

### 4.2 Card block format

Each card is wrapped in `<!-- card -->` and `<!-- /card -->`. Inside the block, an optional fenced `yaml` block holds metadata, followed by `## Front` and `## Back` sections.

````markdown
<!-- card -->

```yaml
id: a1b2c3
difficulty: 5
last_reviewed: 2026-04-25
```

## Front

### Card 1

Text or Markdown here.

## Back

Answer text or Markdown here.

<!-- /card -->
````

### 4.3 Managed card metadata

| Field           | Type                | Default        | Description                                                        |
| --------------- | ------------------- | -------------- | ------------------------------------------------------------------ |
| `id`            | string (8-char hex) | auto-generated | Unique identifier for the card. Generated once, never overwritten. |
| `difficulty`    | integer (`0–5`)     | `3`            | User-assigned difficulty label. `0` means skipped.                 |
| `last_reviewed` | date (`YYYY-MM-DD`) | today's date   | Set explicitly by the user via the review action.                  |

Unknown YAML fields are preserved on rewrite.

Legacy fields such as `paused` may still exist in older decks, but they are not managed by the app anymore and do not affect runtime eligibility.

### 4.4 Parsing rules

The parser must implement the following contract exactly:

1. `cards.md` is parsed as UTF-8 text.
2. A single legacy top YAML block may appear before the first card block and should be ignored by the active model.
3. A card starts on a line containing exactly `<!-- card -->` and ends on a line containing exactly `<!-- /card -->`.
4. Card blocks cannot be nested, overlapped, or left unclosed.
5. Inside a card, the first fenced `yaml` block that appears before `## Front` is treated as card metadata. If none exists, metadata starts empty and repair rules apply.
6. Each card contains exactly one `## Front` section and exactly one `## Back` section, in that order.
7. Everything between `## Front` and `## Back` belongs to the front body. Everything between `## Back` and `<!-- /card -->` belongs to the back body.
8. Additional Markdown headings, fenced code blocks, images, Mermaid fences, inline math, display math, and inline HTML are allowed inside front and back content.
9. Missing or empty managed metadata fields (`id`, `difficulty`, `last_reviewed`) are repairable. Structural violations are hard failures.
10. Unknown YAML fields are preserved during rewrites.
11. Rewrites do not re-emit legacy file-level YAML blocks.

### 4.5 Keeping the parser and the spec in sync

Any file-format change must update all three together in the same change:

- this specification
- parser tests and fixtures
- parser implementation

## 5. Startup and persistence behavior

### 5.1 Hard-fail cases

The server must stop, log an error, and exit when:

- `cards.md` does not exist
- `cards.md` exists but is empty or contains no parseable cards
- `cards.md` contains structural violations that cannot be safely auto-repaired

Examples of structural violations include an unclosed `<!-- card -->` block or a card missing `## Front` or `## Back`.

### 5.2 Required startup backup

On every server launch, after confirming that `cards.md` exists and before any repair or write logic runs, the server must:

- ensure `.bak/` exists
- copy the current `cards.md` to `.bak/YYYY-MM-DDTHH-mm-ss-cards.md.bak`
- preserve the exact pre-repair contents in that backup
- log the backup path in the current run log
- exit if the backup cannot be created

### 5.3 Auto-repair

After the backup is created and the file is confirmed to be structurally valid, the server must:

- parse each card
- fill in missing or empty managed metadata fields
- never overwrite a field that already has a value
- generate `id` with `crypto.randomBytes(4).toString('hex')`
- ensure generated IDs are unique within the file
- save repaired output back to disk via a full-file rewrite of `cards.md`
- log the repairs it made

The minimum valid author input is a `<!-- card -->` ... `<!-- /card -->` block containing `## Front` and `## Back`. Managed metadata can be repaired.

### 5.4 Logging format

Logs should stay line-oriented and human-readable. Each line should include:

- `timestamp`
- `level` (`INFO`, `WARN`, `ERROR`)
- `event`

Recommended contextual fields include:

- `card_id`
- `card_index`
- `file`
- `reason`
- `added`
- `updated`

Example log lines:

```text
[2026-04-25T14:30:00.123Z] INFO startup.begin file=cards.md
[2026-04-25T14:30:00.145Z] INFO backup.created file=.bak/2026-04-25T14-30-00-cards.md.bak
[2026-04-25T14:30:00.201Z] INFO repair.card card_id=a1b2c3d4 added=difficulty,last_reviewed
[2026-04-25T14:30:00.260Z] ERROR startup.invalid_card card_index=3 reason="missing ## Back"
```

## 6. Runtime session behavior

### 6.1 Deck loading

When the app boots, the server returns the full deck payload. The browser is responsible for deriving the visible session from runtime settings.

The initial live settings are:

- order: `shuffle`
- reviewed visibility: show reviewed-today cards
- visible difficulties: `1–5`
- skipped cards (`0`) hidden by default

### 6.2 Visible session derivation

The browser derives the current visible session by:

1. choosing file order or one stable shuffled order
2. filtering cards by the selected visible difficulty levels
3. hiding cards reviewed today when reviewed visibility is set to hide

The resulting ordered subset is the active visible session.

### 6.3 Immediate filter application

Runtime setting changes apply immediately.

Examples:

- if the current card has difficulty `3` and the user removes `3` from the visible filter, that card should drop out of the cycle immediately
- if the current card is marked reviewed while reviewed visibility is set to hide, that card should disappear immediately
- if difficulty `0` is excluded, cards changed to `0` should disappear immediately

When the current card becomes ineligible, the app should move to the next matching card in the active order, then fall back to the previous matching card if needed. If no cards remain, the empty state should appear.

### 6.4 Navigation and metrics

- The app tracks a current card within the visible session.
- `Previous` and `Next` move within the visible session but do not update card fields on their own.
- The visible-session progress bar reflects the current visible position only.
- the `Ready now` count reflects the current visible session only.
- `reviewed_today` is computed from the whole deck, even when reviewed cards are currently hidden from the live view.
- `Skipped cards` reflects the whole deck, not only the visible session.

### 6.5 Card updates

- Changing `difficulty` updates that card in `cards.md` immediately.
- Marking a card as reviewed sets `last_reviewed` to today’s date.
- Review actions are the only UI actions that update `last_reviewed`.
- The UI may undo a review made during the current browser session by restoring the card’s previous `last_reviewed` date.

## 7. User interface contract

### 7.1 Guide surface

- The app may open on a dismissible guide / start surface before study mode.
- The persistent session shell may carry current-card facts while the guide body focuses on study flow guidance and the live runtime controls.
- The hero area should justify why the guide exists before asking the user to press `Start studying`.
- The guide should explain that runtime settings live in the UI instead of `cards.md` file-level config.
- The guide should mention difficulty `0` as skip and may mention Mermaid/KaTeX support.
- Dismissing the guide enters study mode without reloading the page.

### 7.2 Session shell

- Study mode uses one unified session shell rather than separate permanent session panels.
- The top bar keeps three items in a stable order: a guide toggle on the left, a current-card summary in the center, and a session-settings toggle on the right.
- The current-card summary should stay visible even when session settings are collapsed.
- The current-card summary should present a clear `Current card` heading and may use four compact values beneath it: visible position, last reviewed value, current-card timer, and overall session timer.
- The overall session timer starts when study mode first opens and keeps running until the page reloads.
- The current-card timer starts when study mode first opens on the current card and resets when navigation lands on a different card.
- The guide toggle reads `Show guide` or `Hide guide` depending on state.
- The session toggle reads `Show session settings` or `Hide session settings` depending on state.
- Open and closed states should be visually distinct.
- When expanded, the session shell should expose, in one compact and balanced layout:
  - order controls (`File order`, `Shuffle`)
  - reviewed visibility controls (`Show reviewed`, `Hide reviewed`)
  - a multi-select difficulty control for `0–5`
  - a live summary surface with `Ready now`, `Total cards`, `Reviewed today`, and `Skipped cards`
- Expanded session settings should avoid redundant app-name, session-title, or raw internal card IDs.

### 7.3 Study toolbar and card presentation

- `## Front` content is shown by default.
- `Reveal` / `Hide` toggles `## Back`. No animations are required.
- The study toolbar contains `Previous`, `Next`, the difficulty control, `Reveal` / `Hide`, and `Mark as Reviewed`.
- On desktop widths, those controls live together on one slim top row above the card content.
- A thin session-position progress bar sits directly below the toolbar.
- `Previous` / `Next` should read as one connected navigation control.
- Toolbar controls should keep stable widths so label changes do not shift neighboring items.
- The difficulty control uses a clearly labeled select with the values `0–5`, where `0` is labeled as skip, and it should have the same visual weight as the other main toolbar pills.
- The `Reveal` / `Hide` control should use the same blue-for-off and green-for-on visual state language as the review control.
- The front and back surfaces should look visually distinct when the answer is revealed, without relying on a dedicated front/back chip in the toolbar.
- The card surfaces do not need visible `Front` / `Back` or `Prompt` / `Answer` heading rows; the content itself should remain the focus.
- Keyboard shortcuts should support `←` / `→` for navigation, `0–5` for difficulty, `Space` / `Enter` to reveal and hide, and `R` to toggle reviewed state when undo is available.
- The review button should visually indicate whether the current card is already reviewed today.
- Long card content should use normal page scrolling rather than a nested main-content scroller.
- Markdown, Mermaid diagrams, and KaTeX math should render directly inside the card faces after sanitization.

### 7.4 Empty state

If the current visible session has no eligible cards, the UI should show an explicit empty state rather than empty front/back panels.

## 8. Technical constraints and non-goals

- Local app data only. No external database or remote backend.
- Single-user, single-machine assumptions are acceptable in v1.
- All writes to `cards.md` are full-file rewrites in v1.
- No build step. The frontend stays plain HTML/CSS/JS.
- The server also serves `assets/` so local image paths such as `/assets/image.jpg` resolve in the browser.
- Atomic temp-file replacement can be considered later only if failure data justifies the added complexity.

## 9. Verification strategy

Keep v1 verification mostly in Node so feedback stays fast and deterministic.

### 9.1 Required coverage

1. **Parser contract tests**
   - accept valid fixtures
   - reject invalid fixtures with clear errors
   - confirm repairable fixtures are rewritten as expected
   - confirm unknown YAML fields survive rewrites
   - confirm legacy top YAML is ignored on read and dropped on rewrite

2. **Auto-repair tests**
   - fill missing managed metadata
   - never overwrite existing values
   - guarantee unique generated IDs within the file

3. **API integration tests**
   - load the full deck payload
   - update card difficulty, including `0`
   - mark a card as reviewed via `PATCH`
   - confirm each write produces the expected full-file rewrite

4. **Frontend state and shell tests**
   - guide surface renders expected runtime-settings guidance
   - dismissing the guide preserves session state
   - session shell show/hide behavior works without losing context
   - live filter changes immediately update visible cards and current-card selection
   - the current-card summary exposes review-date and timer metadata without resetting during rerenders
   - study toolbar exposes the required controls, a labeled `0–5` difficulty select, and the session-position progress bar
   - keyboard shortcuts map to navigation, reveal/review, and difficulty updates without hijacking focused form controls

5. **Rendering and security tests**
   - sanitize rendered output
   - cover obvious XSS payloads such as `<script>`, inline handlers, and `javascript:` links
   - verify Mermaid and KaTeX assets are wired into the shell

6. **Backup and logging tests**
   - create a `.bak/` file on startup
   - preserve exact pre-repair backup contents
   - create logs with expected events

### 9.2 Test approach

- Prefer Node’s built-in test runner and fixtures for most coverage.
- Browser automation is optional in v1.
- If browser automation becomes necessary, prefer a very small Playwright smoke suite over a large E2E suite.
