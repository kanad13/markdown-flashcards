const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
	CardsFileParseError,
	parseCardsFile,
	serializeCardsFile,
} = require("../src/cards-file");

const fixtureRoot = path.join(__dirname, "fixtures", "parser");

function readFixture(type, filename) {
	return fs.readFileSync(path.join(fixtureRoot, type, filename), "utf8");
}

test("parses card metadata from a valid cards file without requiring file-level settings", () => {
	const parsed = parseCardsFile(readFixture("valid", "basic.cards.md"));

	assert.equal(parsed.frontmatter, undefined);
	assert.equal(parsed.cards.length, 1);
	assert.equal(parsed.cards[0].metadata.id, "abcdef12");
	assert.equal(parsed.cards[0].metadata.last_reviewed, "2026-04-25");
	assert.equal(parsed.cards[0].metadata.note, "keep me");
	assert.deepEqual(parsed.cards[0].metadata.tags, ["alpha", "beta"]);
	assert.match(parsed.cards[0].front, /What is 2 \+ 2\?/);
	assert.match(parsed.cards[0].back, /^\n4\n$/);
});

test("parses cards without metadata and ignores section-looking headings inside fenced code blocks", () => {
	const parsed = parseCardsFile(readFixture("valid", "no-metadata.cards.md"));

	assert.equal(parsed.cards.length, 1);
	assert.deepEqual(parsed.cards[0].metadata, {});
	assert.match(parsed.cards[0].front, /## Back is part of this code fence/);
	assert.match(parsed.cards[0].back, /Still valid\./);
});

test("parses mermaid, math, and heading-like fenced content inside card faces without confusing sections", () => {
	const source = [
		"<!-- card -->",
		"",
		"```yaml",
		"id: facefeed",
		"difficulty: 4",
		"last_reviewed: 2026-04-26",
		"```",
		"",
		"## Front",
		"",
		"Study this flow and formula:",
		"",
		"```mermaid",
		"flowchart LR",
		"  Prompt --> Answer",
		"```",
		"",
		"$$",
		"x^2 + y^2 = z^2",
		"$$",
		"",
		"```md",
		"## Back is part of this code fence",
		"```",
		"",
		"## Back",
		"",
		"Here is inline math: $e^{i\\pi} + 1 = 0$.",
		"",
		"```mermaid",
		"sequenceDiagram",
		"  learner->>deck: review()",
		"```",
		"",
		"<!-- /card -->",
		"",
	].join("\n");

	const parsed = parseCardsFile(source);

	assert.equal(parsed.cards.length, 1);
	assert.match(parsed.cards[0].front, /```mermaid/);
	assert.match(parsed.cards[0].front, /\$\$/);
	assert.match(parsed.cards[0].front, /## Back is part of this code fence/);
	assert.match(parsed.cards[0].back, /e\^\{i\\pi\}/);
	assert.match(parsed.cards[0].back, /```mermaid/);
	assert.equal(serializeCardsFile(parsed), source);
});

test("round-trips unchanged card-only files and preserves unknown YAML fields on rewrite", () => {
	const source = readFixture("valid", "basic.cards.md");
	const parsed = parseCardsFile(source);

	assert.equal(serializeCardsFile(parsed), source);

	parsed.cards[0].metadata.difficulty = 5;

	const reparsed = parseCardsFile(serializeCardsFile(parsed));
	assert.equal(reparsed.cards[0].metadata.note, "keep me");
	assert.deepEqual(reparsed.cards[0].metadata.tags, ["alpha", "beta"]);
	assert.equal(reparsed.cards[0].metadata.difficulty, 5);
});

test("drops a legacy file-level yaml block on rewrite while keeping the card data", () => {
	const source = [
		"```yaml",
		"shuffle: yes",
		"filter_difficulty: [2, 4]",
		"```",
		"",
		"<!-- card -->",
		"",
		"```yaml",
		"id: abcdef12",
		"difficulty: 4",
		"last_reviewed: 2026-04-25",
		"extra_field: keep-me",
		"```",
		"",
		"## Front",
		"",
		"Question",
		"",
		"## Back",
		"",
		"Answer",
		"",
		"<!-- /card -->",
		"",
	].join("\n");

	const parsed = parseCardsFile(source);
	const serialized = serializeCardsFile(parsed);

	assert.doesNotMatch(serialized, /filter_difficulty|shuffle/);
	assert.match(serialized, /extra_field: keep-me/);

	const reparsed = parseCardsFile(serialized);
	assert.equal(reparsed.cards[0].metadata.extra_field, "keep-me");
	assert.equal(reparsed.cards[0].metadata.difficulty, 4);
});

for (const [filename, expectedMessage] of [
	["frontmatter-not-top.cards.md", /unexpected content/i],
	["nested-card.cards.md", /nested|overlapped/i],
	["stray-closing.cards.md", /closing card marker/i],
	["unclosed-card.cards.md", /never closed/i],
	["missing-back.cards.md", /exactly one ## Back/i],
	["back-before-front.cards.md", /after ## Front/i],
	["duplicate-front.cards.md", /exactly one ## Front/i],
]) {
	test(`rejects invalid parser fixture: ${filename}`, () => {
		assert.throws(
			() => parseCardsFile(readFixture("invalid", filename)),
			(error) => {
				assert.ok(error instanceof CardsFileParseError);
				assert.match(error.message, expectedMessage);
				return true;
			},
		);
	});
}
