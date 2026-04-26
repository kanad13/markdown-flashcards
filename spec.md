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
- **Data store:** `cards.md`
- **Port:** `54123`
- **Backups:** `.bak/`, one timestamped backup per server launch
- **Logs:** `logs/`, one timestamped human-readable log file per server run
- **YAML parsing:** `js-yaml`
- **Dev mode:** `node --watch server.js`

## 3. Core concepts

- **Cards file:** `cards.md` is the canonical storage for both content and managed metadata.
- **Managed metadata:** the app manages `id`, `difficulty`, `last_reviewed`, and `paused` for each card.
- **Session:** a session is the filtered and ordered list of eligible cards produced from `cards.md` at load time.
- **Reviewed today:** the count of cards in the current session whose `last_reviewed` value matches today's date.

## 4. Data model and file format

### 4.1 File-level frontmatter

File-level frontmatter controls session behavior and must appear once at the very top of `cards.md`.

````markdown
```yaml
filter_difficulty: [1, 2, 3]
shuffle: yes
exclude_reviewed_today: false
```
````

| Field                    | Type                    | Description                                                                                                                                        |
| ------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filter_difficulty`      | array of integers (1–5) | Only cards with a matching difficulty are included in the session. Omitting this field includes all difficulties.                                  |
| `shuffle`                | `yes` / `no`            | `yes` = cards are presented in a random order each session. `no` = cards are presented in file order.                                              |
| `exclude_reviewed_today` | boolean                 | Defaults to `false`. When `true`, cards whose `last_reviewed` already matches the session-start date are skipped while the session stack is built. |

### 4.2 Card block format

Each card is wrapped in `<!-- card -->` and `<!-- /card -->`. Inside the block, a fenced `yaml` block holds metadata, followed by `## Front` and `## Back` sections.

````markdown
```yaml
filter_difficulty: [1, 2, 3]
shuffle: yes
exclude_reviewed_today: false
```

<!-- card -->

```yaml
id: a1b2c3
difficulty: 5
last_reviewed: 2026-04-25
paused: no
```

## Front

### Card 1

Text or Markdown here.

## Back

Answer text or Markdown here.

<!-- /card -->
````

### 4.3 Managed card metadata

| Field           | Type                | Default        | Description                                                                                      |
| --------------- | ------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `id`            | string (8-char hex) | auto-generated | Unique identifier for the card. Generated once, never overwritten.                               |
| `difficulty`    | integer (1–5)       | `3`            | User-assigned difficulty label. Used for session filtering.                                      |
| `last_reviewed` | date (`YYYY-MM-DD`) | today's date   | Set explicitly by the user via "Mark as Reviewed".                                               |
| `paused`        | `yes` / `no`        | `no`           | `yes` = this card is paused and will not appear in any session, regardless of difficulty filter. |

### 4.4 Parsing rules

The parser must implement the following contract exactly:

1. `cards.md` is parsed as UTF-8 text.
2. File-level frontmatter appears once, as the first fenced `yaml` code block in the file, before any card blocks.
3. A card starts on a line containing exactly `<!-- card -->` and ends on a line containing exactly `<!-- /card -->`.
4. Card blocks cannot be nested, overlapped, or left unclosed.
5. Inside a card, the first fenced `yaml` block that appears before `## Front` is treated as card metadata. If none exists, metadata starts empty and repair rules apply.
6. Each card contains exactly one `## Front` section and exactly one `## Back` section, in that order.
7. Everything between `## Front` and `## Back` belongs to the front body. Everything between `## Back` and `<!-- /card -->` belongs to the back body.
8. Additional Markdown headings, fenced code blocks, images, and inline HTML are allowed inside front and back content.
9. Missing or empty managed metadata fields (`id`, `difficulty`, `last_reviewed`, `paused`) are repairable. Structural violations are hard failures.
10. Unknown YAML fields are preserved during rewrites.

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

## 6. Session behavior

### 6.1 Session creation

When the app loads a session, it must:

- apply `filter_difficulty` if present
- exclude cards whose `paused` value is `yes`
- exclude cards already reviewed on the session-start date when `exclude_reviewed_today` is `true`
- apply `shuffle` ordering after filtering

The resulting filtered and ordered list is the session stack.

### 6.2 Session metrics and navigation

- The app tracks a current card index within the session stack.
- `Previous` and `Next` move within that stack but do not update card fields on their own.
- `reviewed_today` is computed from cards in the current session only.
- A card excluded by `exclude_reviewed_today: true` is removed only if it was already reviewed when the session stack was created.
- Cards that remain in the active session stack do not disappear mid-session after the user marks them reviewed.

### 6.3 Card updates

- Changing `difficulty` updates that card in `cards.md` immediately.
- Marking a card as reviewed sets `last_reviewed` to today's date.
- Review actions are the only UI actions that update `last_reviewed`.
- The UI may undo a review made during the current browser session by restoring the card's previous `last_reviewed` date.

## 7. User interface contract

### 7.1 Guide surface

- The app may open on a dismissible guide / start surface before study mode.
- The persistent session shell may carry current session facts while the guide body focuses on study flow guidance, a concise explanation of the top banner, and configuration help for `cards.md`.
- The hero area should justify why the guide exists before asking the user to press `Start studying`.
- The hero may fold short session reminders directly into the main copy rather than using a separate highlighted callout box.
- The guide should explain that file-level session settings are applied on the next server start / refreshed session rather than hot-reloaded from disk.
- Dismissing the guide enters study mode without reloading the page.

### 7.2 Session shell

- Study mode uses one unified session shell rather than separate permanent session panels.
- The top bar keeps three items in a stable order: a guide toggle on the left, a current-card summary in the center, and a session-info toggle on the right.
- The current-card summary should stay visible even when session info is collapsed.
- The current-card summary should present a clear `Current card` heading and may use four compact values beneath it: position in stack, last reviewed value, current-card timer, and overall session timer.
- The overall session timer starts when study mode first opens and keeps running until the page reloads.
- The current-card timer starts when study mode first opens on the current card and resets when navigation lands on a different card.
- The guide toggle reads `Show guide` or `Hide guide` depending on state.
- The session-info toggle reads `Show session info` or `Hide session info` depending on state.
- Open and closed states should be visually distinct.
- When expanded, session information should show session-level facts only, in this order: `Order`, `Filters`, `Eligible`, `Reviewed today`.
- The `Filters` value should default to `All difficulties` when there is no effective difficulty restriction, including when the configured difficulty list is effectively `1–5`.
- The `Filters` value should mention the reviewed-today rule only when `exclude_reviewed_today` is enabled; the default inclusion case should stay implicit rather than reading as redundant filler.
- Expanded session info should avoid redundant app-name, session-title, floating progress summaries, or internal current-card metadata such as raw card IDs.

### 7.3 Study toolbar and card presentation

- `## Front` content is shown by default.
- `Reveal` / `Hide` toggles `## Back`. No animations are required.
- The study toolbar contains `Previous`, `Next`, the difficulty control, `Reveal` / `Hide`, and `Mark as Reviewed`.
- On desktop widths, those controls live together on one slim top row above the card content.
- A thin session-position progress bar sits directly below the toolbar.
- `Previous` / `Next` should read as one connected navigation control.
- Toolbar controls should keep stable widths so label changes do not shift neighboring items.
- The difficulty control uses a clearly labeled compact select with the values `1–5`.
- The `Reveal` / `Hide` control should use the same blue-for-off and green-for-on visual state language as the review control.
- The front and back surfaces should look visually distinct when the answer is revealed, without relying on a dedicated front/back chip in the toolbar.
- The card surfaces do not need visible `Front` / `Back` or `Prompt` / `Answer` heading rows; the content itself should remain the focus.
- Keyboard shortcuts should support `←` / `→` for navigation, `1–5` for difficulty, `Space` / `Enter` to reveal and hide, and `R` to toggle reviewed state when undo is available.
- The review button should visually indicate whether the current card is already reviewed today.
- Long card content should use normal page scrolling rather than a nested main-content scroller.

### 7.4 Empty state

If the current session has no eligible cards, the UI should show an explicit empty state rather than empty front/back panels.

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

2. **Auto-repair tests**
   - fill missing managed metadata
   - never overwrite existing values
   - guarantee unique generated IDs within the file

3. **Session logic tests**
   - `filter_difficulty` inclusion
   - `paused: yes` exclusion
   - `exclude_reviewed_today: true` exclusion at session creation time only
   - `shuffle: yes` vs `shuffle: no`
   - correct `reviewed_today` computation

4. **API integration tests**
   - load the current session
   - update card difficulty
   - mark a card as reviewed via `PATCH`
   - confirm each write produces the expected full-file rewrite

5. **Frontend state and shell tests**
   - guide surface renders expected file/session/help information
   - dismissing the guide preserves session state
   - session shell show/hide behavior works without losing context
   - the current-card summary exposes review-date and timer metadata without resetting during rerenders
   - study toolbar exposes the required stable-width controls, a labeled 1–5 difficulty select, and the session-position progress bar
   - the study surfaces remain unlabeled while the reveal control still exposes clear on/off state
   - keyboard shortcuts map to navigation, reveal/review, and difficulty updates without hijacking focused form controls
   - long-card layouts rely on page scrolling rather than a nested main-content scroller

6. **Security tests**
   - sanitize rendered output
   - cover obvious XSS payloads such as `<script>`, inline handlers, and `javascript:` links

7. **Backup and logging tests**
   - create a `.bak/` file on startup
   - preserve exact pre-repair backup contents
   - create logs with expected events

### 9.2 Test approach

- Prefer Node's built-in test runner and fixtures for most coverage.
- Browser automation is optional in v1.
- If browser automation becomes necessary, prefer a very small Playwright smoke suite over a large E2E suite.
