# TASKS

This file is the current work queue derived from `spec.md`. Keep it focused on the next sequenced slices of work rather than preserving old completed phases forever.

## Rules

- Keep only current or upcoming work here.
- Order items top-to-bottom in the sequence they should be implemented.
- If a task reveals a spec gap, update `spec.md` first, then update this file.
- Only check a box when the code exists and the relevant tests pass.

## Next sequence

### 1. Deepen rendering and sanitization confidence

- [ ] Add explicit XSS regression coverage for rendered Markdown, including `<script>`, inline handlers, and `javascript:` links
- [ ] Add at least one focused test around Mermaid and KaTeX enhancement hooks beyond shell wiring
- [ ] Decide whether any additional sanitization fixtures belong under `test/fixtures/`

### 2. Validate the new live-session controls on a larger deck

- [ ] Smoke test live difficulty filtering, reviewed visibility, and difficulty `0` against a larger real deck
- [ ] Decide whether runtime settings should remain per-load only or persist locally in the browser later
- [ ] Re-evaluate whether the stable shuffled order needs an explicit `Reshuffle` action after real usage feedback

### 3. Increase confidence only if needed

- [ ] Add a tiny browser smoke suite only if Node-level tests stop being enough
- [ ] Re-evaluate atomic temp-file replacement only if failure data justifies the added complexity

## Later

- [ ] Decide later whether a dedicated `docs/development.md` or `CONTRIBUTING.md` would improve long-term maintainability
