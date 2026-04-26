const assert = require("node:assert/strict");
const test = require("node:test");

const { parseCardsFile } = require("../src/cards-file");
const { createSessionPayload, createSessionState } = require("../src/session");

function parseModel(source) {
	return parseCardsFile(source);
}

function createRandomStub(values) {
	let index = 0;

	return () => {
		const value = values[index] ?? 0;
		index += 1;
		return value;
	};
}

test("builds the session stack from filter_difficulty and paused cards without shuffling when shuffle is no", () => {
	const model = parseModel(
		[
			"```yaml",
			"filter_difficulty: [2, 4]",
			"shuffle: no",
			"```",
			"",
			"<!-- card -->",
			"",
			"```yaml",
			"id: alpha111",
			"difficulty: 2",
			"last_reviewed: 2026-04-20",
			"paused: no",
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
			"difficulty: 3",
			"last_reviewed: 2026-04-21",
			"paused: no",
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
			"<!-- card -->",
			"",
			"```yaml",
			"id: gamma333",
			"difficulty: 4",
			"last_reviewed: 2026-04-22",
			"paused: yes",
			"```",
			"",
			"## Front",
			"",
			"Gamma",
			"",
			"## Back",
			"",
			"C",
			"",
			"<!-- /card -->",
			"",
			"<!-- card -->",
			"",
			"```yaml",
			"id: delta444",
			"difficulty: 4",
			"last_reviewed: 2026-04-23",
			"paused: no",
			"```",
			"",
			"## Front",
			"",
			"Delta",
			"",
			"## Back",
			"",
			"D",
			"",
			"<!-- /card -->",
			"",
		].join("\n"),
	);

	const session = createSessionState(model);

	assert.deepEqual(session.card_ids, ["alpha111", "delta444"]);
	assert.deepEqual(session.filter_difficulty, [2, 4]);
	assert.equal(session.shuffle, "no");
});

test("shuffles eligible cards when the file-level frontmatter enables shuffle", () => {
	const model = parseModel(
		[
			"```yaml",
			"shuffle: yes",
			"```",
			"",
			"<!-- card -->",
			"",
			"```yaml",
			"id: alpha111",
			"difficulty: 1",
			"last_reviewed: 2026-04-20",
			"paused: no",
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
			"difficulty: 2",
			"last_reviewed: 2026-04-20",
			"paused: no",
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
			"<!-- card -->",
			"",
			"```yaml",
			"id: gamma333",
			"difficulty: 3",
			"last_reviewed: 2026-04-20",
			"paused: no",
			"```",
			"",
			"## Front",
			"",
			"Gamma",
			"",
			"## Back",
			"",
			"C",
			"",
			"<!-- /card -->",
			"",
		].join("\n"),
	);

	const session = createSessionState(model, {
		random: createRandomStub([0.1, 0.9]),
	});

	assert.deepEqual(session.card_ids, ["gamma333", "beta2222", "alpha111"]);
	assert.equal(session.shuffle, "yes");
});

test("computes reviewed_today from the current session cards only", () => {
	const model = parseModel(
		[
			"```yaml",
			"filter_difficulty: [2, 4]",
			"shuffle: no",
			"```",
			"",
			"<!-- card -->",
			"",
			"```yaml",
			"id: alpha111",
			"difficulty: 2",
			"last_reviewed: 2026-04-26",
			"paused: no",
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
			"difficulty: 3",
			"last_reviewed: 2026-04-26",
			"paused: no",
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
			"<!-- card -->",
			"",
			"```yaml",
			"id: delta444",
			"difficulty: 4",
			"last_reviewed: 2026-04-20",
			"paused: no",
			"```",
			"",
			"## Front",
			"",
			"Delta",
			"",
			"## Back",
			"",
			"D",
			"",
			"<!-- /card -->",
			"",
		].join("\n"),
	);

	const session = createSessionState(model);
	const payload = createSessionPayload(model, session, {
		now: () => new Date("2026-04-26T12:00:00.000Z"),
	});

	assert.equal(payload.session.total_cards, 2);
	assert.equal(payload.session.reviewed_today, 1);
	assert.deepEqual(
		payload.cards.map((card) => card.id),
		["alpha111", "delta444"],
	);
});
