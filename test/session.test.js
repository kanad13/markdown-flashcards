const assert = require("node:assert/strict");
const test = require("node:test");

const { parseCardsFile } = require("../src/cards-file");
const {
	createDeckPayload,
	markCardReviewed,
	updateCardDifficulty,
} = require("../src/session");

function parseModel(source) {
	return parseCardsFile(source);
}

test("createDeckPayload returns the full deck and counts cards reviewed today", () => {
	const model = parseModel(
		[
			"<!-- card -->",
			"",
			"```yaml",
			"id: alpha111",
			"difficulty: 2",
			"last_reviewed: 2026-04-26",
			"```",
			"",
			"## Front",
			"",
			"Alpha",
			"",
			"## Back",
			"",
			"A",
			"",
			"<!-- /card -->",
			"",
			"<!-- card -->",
			"",
			"```yaml",
			"id: beta2222",
			"difficulty: 0",
			"last_reviewed: 2026-04-20",
			"paused: yes",
			"```",
			"",
			"## Front",
			"",
			"Beta",
			"",
			"## Back",
			"",
			"B",
			"",
			"<!-- /card -->",
			"",
		].join("\n"),
	);

	const payload = createDeckPayload(model, {
		now: () => new Date("2026-04-26T12:00:00.000Z"),
	});

	assert.equal(payload.deck.total_cards, 2);
	assert.equal(payload.deck.reviewed_today, 1);
	assert.equal(payload.deck.today, "2026-04-26");
	assert.deepEqual(
		payload.cards.map((card) => card.id),
		["alpha111", "beta2222"],
	);
	assert.equal(payload.cards[1].difficulty, 0);
	assert.equal("paused" in payload.cards[1], false);
});

test("updateCardDifficulty accepts 0 as the skip difficulty level", () => {
	const model = parseModel(
		[
			"<!-- card -->",
			"",
			"```yaml",
			"id: alpha111",
			"difficulty: 3",
			"last_reviewed: 2026-04-20",
			"```",
			"",
			"## Front",
			"",
			"Alpha",
			"",
			"## Back",
			"",
			"A",
			"",
			"<!-- /card -->",
			"",
		].join("\n"),
	);

	const nextState = updateCardDifficulty(model, "alpha111", 0);

	assert.equal(nextState.card.metadata.difficulty, 0);
	assert.equal(nextState.model.cards[0].metadata.difficulty, 0);
});

test("markCardReviewed updates last_reviewed to the provided date", () => {
	const model = parseModel(
		[
			"<!-- card -->",
			"",
			"```yaml",
			"id: alpha111",
			"difficulty: 3",
			"last_reviewed: 2026-04-20",
			"```",
			"",
			"## Front",
			"",
			"Alpha",
			"",
			"## Back",
			"",
			"A",
			"",
			"<!-- /card -->",
			"",
		].join("\n"),
	);

	const nextState = markCardReviewed(model, "alpha111", {
		now: () => new Date("2026-04-26T12:00:00.000Z"),
	});

	assert.equal(nextState.card.metadata.last_reviewed, "2026-04-26");
	assert.equal(nextState.model.cards[0].metadata.last_reviewed, "2026-04-26");
});
