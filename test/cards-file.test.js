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

test("parses file-level frontmatter and card metadata from a valid cards file", () => {
	const parsed = parseCardsFile(readFixture("valid", "basic.cards.md"));

	assert.deepEqual(parsed.frontmatter.filter_difficulty, [1, 2, 3]);
	assert.equal(parsed.frontmatter.shuffle, "yes");
	assert.equal(parsed.frontmatter.custom_setting, "keep-me");
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

test("round-trips unchanged valid files and preserves unknown YAML fields on rewrite", () => {
	const source = readFixture("valid", "basic.cards.md");
	const parsed = parseCardsFile(source);

	assert.equal(serializeCardsFile(parsed), source);

	parsed.frontmatter.shuffle = "no";
	parsed.cards[0].metadata.difficulty = 5;

	const reparsed = parseCardsFile(serializeCardsFile(parsed));
	assert.equal(reparsed.frontmatter.custom_setting, "keep-me");
	assert.equal(reparsed.frontmatter.shuffle, "no");
	assert.equal(reparsed.cards[0].metadata.note, "keep me");
	assert.deepEqual(reparsed.cards[0].metadata.tags, ["alpha", "beta"]);
	assert.equal(reparsed.cards[0].metadata.difficulty, 5);
});

for (const [filename, expectedMessage] of [
	["frontmatter-not-top.cards.md", /frontmatter/i],
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
