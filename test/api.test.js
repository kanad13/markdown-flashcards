const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { parseCardsFile, serializeCardsFile } = require("../src/cards-file");
const { startServer } = require("../server");

function fixedNow() {
	return new Date("2026-04-26T12:34:56.789Z");
}

async function createTempWorkspace(t) {
	const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "garbage-04-api-"));
	t.after(async () => {
		await fs.rm(rootDir, { recursive: true, force: true });
	});
	return rootDir;
}

async function startTestServer(t, { cardsSource } = {}) {
	const rootDir = await createTempWorkspace(t);
	await fs.writeFile(path.join(rootDir, "cards.md"), cardsSource, "utf8");

	const started = await startServer({
		rootDir,
		now: fixedNow,
		port: 0,
		quiet: true,
	});

	t.after(async () => {
		await new Promise((resolve, reject) => {
			started.server.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	});

	const address = started.server.address();
	const port = typeof address === "object" && address ? address.port : 0;

	return {
		baseUrl: `http://127.0.0.1:${port}`,
		rootDir,
		started,
	};
}

test("startServer rejects with a helpful message when the requested port is already in use", async (t) => {
	const source = [
		"<!-- card -->",
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

	const firstRootDir = await createTempWorkspace(t);
	await fs.writeFile(path.join(firstRootDir, "cards.md"), source, "utf8");

	const started = await startServer({
		rootDir: firstRootDir,
		now: fixedNow,
		port: 0,
		quiet: true,
	});

	t.after(async () => {
		await new Promise((resolve, reject) => {
			started.server.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	});

	const address = started.server.address();
	const port = typeof address === "object" && address ? address.port : 0;

	const secondRootDir = await createTempWorkspace(t);
	await fs.writeFile(path.join(secondRootDir, "cards.md"), source, "utf8");

	await assert.rejects(
		() =>
			startServer({
				rootDir: secondRootDir,
				now: fixedNow,
				port,
				quiet: true,
			}),
		(error) => {
			assert.equal(error.code, "EADDRINUSE");
			assert.match(
				error.message,
				new RegExp(`Port ${port} is already in use\\.`),
			);
			assert.match(error.message, new RegExp(`http://localhost:${port}`));
			assert.match(
				error.message,
				new RegExp(`pid=\\$\\(lsof -tiTCP:${port} -sTCP:LISTEN\\)`),
			);
			assert.match(error.message, /\[\[ -n "\$pid" \]\] && kill "\$pid"/);
			assert.match(
				error.message,
				new RegExp(`No server is listening on port ${port}\\.`),
			);
			return true;
		},
	);
});

test("GET /api/session returns the full deck payload and deck summary", async (t) => {
	const source = [
		"```yaml",
		"shuffle: yes",
		"exclude_reviewed_today: true",
		"```",
		"",
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
	].join("\n");

	const { baseUrl } = await startTestServer(t, {
		cardsSource: source,
	});

	const response = await fetch(`${baseUrl}/api/session`);
	const payload = await response.json();

	assert.equal(response.status, 200);
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

test("PATCH /api/cards/:cardId/difficulty updates the card and rewrites cards.md", async (t) => {
	const source = [
		"<!-- card -->",
		"",
		"```yaml",
		"id: alpha111",
		"difficulty: 3",
		"last_reviewed: 2026-04-20",
		"unknown_field: keep-me",
		"```",
		"",
		"## Front",
		"",
		"Alpha front",
		"",
		"## Back",
		"",
		"Alpha back",
		"",
		"<!-- /card -->",
		"",
	].join("\n");

	const { baseUrl, rootDir } = await startTestServer(t, {
		cardsSource: source,
	});

	const response = await fetch(`${baseUrl}/api/cards/alpha111/difficulty`, {
		method: "PATCH",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ difficulty: 0 }),
	});
	const payload = await response.json();

	assert.equal(response.status, 200);
	assert.equal(payload.card.id, "alpha111");
	assert.equal(payload.card.difficulty, 0);
	assert.equal(payload.deck.total_cards, 1);
	assert.equal(payload.deck.reviewed_today, 0);

	const expectedModel = parseCardsFile(source);
	expectedModel.cards[0].metadata.difficulty = 0;

	const rewritten = await fs.readFile(path.join(rootDir, "cards.md"), "utf8");
	assert.equal(rewritten, serializeCardsFile(expectedModel));

	const reparsed = parseCardsFile(rewritten);
	assert.equal(reparsed.cards[0].metadata.difficulty, 0);
	assert.equal(reparsed.cards[0].metadata.unknown_field, "keep-me");
});

test("PATCH /api/cards/:cardId/review updates last_reviewed and the deck summary", async (t) => {
	const source = [
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
		"Alpha front",
		"",
		"## Back",
		"",
		"Alpha back",
		"",
		"<!-- /card -->",
		"",
		"<!-- card -->",
		"",
		"```yaml",
		"id: beta2222",
		"difficulty: 4",
		"last_reviewed: 2026-04-20",
		"```",
		"",
		"## Front",
		"",
		"Beta front",
		"",
		"## Back",
		"",
		"Beta back",
		"",
		"<!-- /card -->",
		"",
	].join("\n");

	const { baseUrl, rootDir } = await startTestServer(t, {
		cardsSource: source,
	});

	const response = await fetch(`${baseUrl}/api/cards/alpha111/review`, {
		method: "PATCH",
	});
	const payload = await response.json();

	assert.equal(response.status, 200);
	assert.equal(payload.card.last_reviewed, "2026-04-26");
	assert.equal(payload.deck.reviewed_today, 1);
	assert.equal(payload.deck.total_cards, 2);

	const expectedModel = parseCardsFile(source);
	expectedModel.cards[0].metadata.last_reviewed = "2026-04-26";

	const rewritten = await fs.readFile(path.join(rootDir, "cards.md"), "utf8");
	assert.equal(rewritten, serializeCardsFile(expectedModel));

	const sessionResponse = await fetch(`${baseUrl}/api/session`);
	const sessionPayload = await sessionResponse.json();
	assert.equal(sessionPayload.deck.reviewed_today, 1);
	assert.equal(sessionPayload.cards[0].last_reviewed, "2026-04-26");
});

test("PATCH /api/cards/:cardId/review with reviewed false restores the previous review date", async (t) => {
	const source = [
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
		"Alpha front",
		"",
		"## Back",
		"",
		"Alpha back",
		"",
		"<!-- /card -->",
		"",
	].join("\n");

	const { baseUrl, rootDir } = await startTestServer(t, {
		cardsSource: source,
	});

	await fetch(`${baseUrl}/api/cards/alpha111/review`, {
		method: "PATCH",
	});

	const response = await fetch(`${baseUrl}/api/cards/alpha111/review`, {
		method: "PATCH",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			reviewed: false,
			restore_last_reviewed: "2026-04-20",
		}),
	});
	const payload = await response.json();

	assert.equal(response.status, 200);
	assert.equal(payload.card.last_reviewed, "2026-04-20");
	assert.equal(payload.deck.reviewed_today, 0);
	assert.equal(payload.deck.total_cards, 1);

	const rewritten = await fs.readFile(path.join(rootDir, "cards.md"), "utf8");
	assert.equal(rewritten, source);
});
