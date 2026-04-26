# TASKS

This file is the current work queue derived from `spec.md`. Keep it focused on the next sequenced slices of work rather than preserving old completed phases forever.

## Rules

- Keep only current or upcoming work here.
- Order items top-to-bottom in the sequence they should be implemented.
- If a task reveals a spec gap, update `spec.md` first, then update this file.
- Only check a box when the code exists and the relevant tests pass.

## Next sequence

### 1. Deepen rendering and sanitization confidence

- [ ] Add explicit XSS regression coverage for rendered markdown, including `<script>`, inline handlers, and `javascript:` links
- [ ] Review remaining DOM insertion points and keep sanitization expectations explicit in tests
- [ ] Decide whether additional sanitization fixtures belong under `test/fixtures/`

### 2. Expand parser repair coverage

- [ ] Add repairable fixtures for missing managed metadata fields
- [ ] Assert repaired output exactly matches expected rewrites
- [ ] Keep parser, fixtures, and `spec.md` in sync for any format adjustments

### 3. Validate the new study controls

- [ ] Smoke test the 1–5 difficulty migration against a larger real deck
- [ ] Decide whether the compact toolbar needs inline shortcut hints beyond the guide copy
- [ ] Re-evaluate optional extras like Escape-to-hide or Zen mode only after real usage feedback

### 4. Increase confidence only if needed

- [ ] Add a tiny browser smoke suite only if Node-level tests stop being enough
- [ ] Re-evaluate atomic temp-file replacement only if failure data justifies the added complexity

## Later

- [ ] Decide later whether a dedicated `docs/development.md` or `CONTRIBUTING.md` would improve long-term maintainability
