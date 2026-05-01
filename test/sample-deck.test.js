const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { parseCardsFile, serializeCardsFile } = require("../src/cards-file");

const sampleDeckPath = path.join(__dirname, "..", "cards.md");

function containsMath(markdown) {
	return /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+\$|\\\([^\n]+\\\))/.test(
		markdown,
	);
}

test("sample cards.md covers the supported content scenarios and round-trips cleanly", () => {
	const source = fs.readFileSync(sampleDeckPath, "utf8");
	const parsed = parseCardsFile(source);

	assert.ok(parsed.cards.length >= 8);
	assert.equal(
		new Set(parsed.cards.map((card) => card.metadata.id)).size,
		parsed.cards.length,
	);

	for (const difficulty of [0, 1, 2, 3, 4, 5]) {
		assert.ok(
			parsed.cards.some((card) => card.metadata.difficulty === difficulty),
			`Expected the sample deck to include difficulty ${difficulty}.`,
		);
	}

	assert.ok(parsed.cards.some((card) => /```mermaid/.test(card.front)));
	assert.ok(parsed.cards.some((card) => /```mermaid/.test(card.back)));
	assert.ok(parsed.cards.some((card) => containsMath(card.front)));
	assert.ok(parsed.cards.some((card) => containsMath(card.back)));
	assert.ok(
		parsed.cards.some(
			(card) => /\/assets\//.test(card.front) || /\/assets\//.test(card.back),
		),
	);
	assert.ok(
		parsed.cards.some((card) =>
			/## Back is part of this code fence/.test(card.front),
		),
	);
	assert.ok(
		parsed.cards.some(
			(card) =>
				/\| Syntax \| Use \|/.test(card.front) ||
				/\| Syntax \| Use \|/.test(card.back),
		),
	);
	assert.ok(
		parsed.cards.some(
			(card) => /^> /m.test(card.front) || /^> /m.test(card.back),
		),
	);
	assert.equal(serializeCardsFile(parsed), source);
});
