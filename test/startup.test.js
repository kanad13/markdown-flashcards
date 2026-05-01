const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { parseCardsFile } = require("../src/cards-file");
const {
	StartupValidationError,
	initializeCardsRepository,
} = require("../src/startup");

const FIXED_NOW_ISO = "2026-04-26T12:34:56.789Z";
const FIXED_LOG_NAME = "2026-04-26T12-34-56.log";
const FIXED_BACKUP_NAME = "2026-04-26T12-34-56-cards.md.bak";

function fixedNow() {
	return new Date(FIXED_NOW_ISO);
}

async function createTempWorkspace(t) {
	const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "garbage-04-"));
	t.after(async () => {
		await fs.rm(rootDir, { recursive: true, force: true });
	});
	return rootDir;
}

async function readLog(rootDir) {
	return fs.readFile(path.join(rootDir, "logs", FIXED_LOG_NAME), "utf8");
}

function createRandomBytesStub(hexValues) {
	let index = 0;

	return (size) => {
		assert.equal(size, 4);
		const hexValue = hexValues[index] ?? "ffffffff";
		index += 1;
		return Buffer.from(hexValue, "hex");
	};
}

test("startup hard-fails when cards.md is missing and records the error in the run log", async (t) => {
	const rootDir = await createTempWorkspace(t);

	await assert.rejects(
		() => initializeCardsRepository({ rootDir, now: fixedNow }),
		(error) => {
			assert.ok(error instanceof StartupValidationError);
			assert.equal(error.code, "CARDS_FILE_MISSING");
			return true;
		},
	);

	const logContents = await readLog(rootDir);
	assert.match(logContents, /INFO startup\.begin file=cards\.md/);
	assert.match(
		logContents,
		/ERROR startup\.missing_cards file=cards\.md reason="cards\.md is missing\."/,
	);
});

test("startup hard-fails when cards.md has no parseable cards after creating the required backup", async (t) => {
	const rootDir = await createTempWorkspace(t);
	const source = "```yaml\nshuffle: yes\n```\n";

	await fs.writeFile(path.join(rootDir, "cards.md"), source, "utf8");

	await assert.rejects(
		() => initializeCardsRepository({ rootDir, now: fixedNow }),
		(error) => {
			assert.ok(error instanceof StartupValidationError);
			assert.equal(error.code, "NO_PARSEABLE_CARDS");
			return true;
		},
	);

	const backupContents = await fs.readFile(
		path.join(rootDir, ".bak", FIXED_BACKUP_NAME),
		"utf8",
	);
	assert.equal(backupContents, source);

	const logContents = await readLog(rootDir);
	assert.match(
		logContents,
		/INFO backup\.created file=\.bak\/2026-04-26T12-34-56-cards\.md\.bak/,
	);
	assert.match(
		logContents,
		/ERROR startup\.no_cards file=cards\.md reason="cards\.md contains no parseable cards\."/,
	);
});

test("startup backs up an empty cards.md before hard-failing", async (t) => {
	const rootDir = await createTempWorkspace(t);
	const source = "\n";

	await fs.writeFile(path.join(rootDir, "cards.md"), source, "utf8");

	await assert.rejects(
		() => initializeCardsRepository({ rootDir, now: fixedNow }),
		(error) => {
			assert.ok(error instanceof StartupValidationError);
			assert.equal(error.code, "EMPTY_CARDS_FILE");
			return true;
		},
	);

	const backupContents = await fs.readFile(
		path.join(rootDir, ".bak", FIXED_BACKUP_NAME),
		"utf8",
	);
	assert.equal(backupContents, source);

	const logContents = await readLog(rootDir);
	assert.match(
		logContents,
		/INFO backup\.created file=\.bak\/2026-04-26T12-34-56-cards\.md\.bak/,
	);
	assert.match(
		logContents,
		/ERROR startup\.empty_cards file=cards\.md reason="cards\.md is empty\."/,
	);
});

test("startup exits when the required backup cannot be created", async (t) => {
	const rootDir = await createTempWorkspace(t);
	const source =
		"```yaml\nshuffle: yes\n```\n\n<!-- card -->\n\n## Front\n\nQuestion\n\n## Back\n\nAnswer\n\n<!-- /card -->\n";

	await fs.writeFile(path.join(rootDir, "cards.md"), source, "utf8");
	await fs.writeFile(path.join(rootDir, ".bak"), "not-a-directory", "utf8");

	await assert.rejects(
		() => initializeCardsRepository({ rootDir, now: fixedNow }),
		(error) => {
			assert.ok(error instanceof StartupValidationError);
			assert.equal(error.code, "BACKUP_FAILED");
			return true;
		},
	);

	const logContents = await readLog(rootDir);
	assert.match(
		logContents,
		/ERROR backup\.failed file=\.bak\/2026-04-26T12-34-56-cards\.md\.bak/,
	);
});

test("startup hard-fails on structural card violations and logs the invalid card index", async (t) => {
	const rootDir = await createTempWorkspace(t);
	const source = [
		"```yaml",
		"shuffle: yes",
		"```",
		"",
		"<!-- card -->",
		"",
		"## Front",
		"",
		"Question without a matching close.",
	].join("\n");

	await fs.writeFile(path.join(rootDir, "cards.md"), source, "utf8");

	await assert.rejects(
		() => initializeCardsRepository({ rootDir, now: fixedNow }),
		(error) => {
			assert.ok(error instanceof StartupValidationError);
			assert.equal(error.code, "INVALID_CARDS_FILE");
			assert.match(error.message, /never closed/i);
			return true;
		},
	);

	const logContents = await readLog(rootDir);
	assert.match(
		logContents,
		/ERROR startup\.invalid_card file=cards\.md reason="Card block was opened but never closed\." card_index=1/,
	);
	const backupContents = await fs.readFile(
		path.join(rootDir, ".bak", FIXED_BACKUP_NAME),
		"utf8",
	);
	assert.equal(backupContents, source);
});

test("startup repairs missing managed metadata, preserves unknown fields, and writes repair logs", async (t) => {
	const rootDir = await createTempWorkspace(t);
	const source = [
		"<!-- card -->",
		"",
		"## Front",
		"",
		"Question one",
		"",
		"## Back",
		"",
		"Answer one",
		"",
		"<!-- /card -->",
		"",
		"<!-- card -->",
		"",
		"```yaml",
		"id: deadbeef",
		"difficulty: 3",
		"last_reviewed:",
		"extra_field: keep-me",
		"```",
		"",
		"## Front",
		"",
		"Question two",
		"",
		"## Back",
		"",
		"Answer two",
		"",
		"<!-- /card -->",
		"",
		"<!-- card -->",
		"",
		"```yaml",
		"id:",
		"difficulty:",
		"last_reviewed:",
		"```",
		"",
		"## Front",
		"",
		"Question three",
		"",
		"## Back",
		"",
		"Answer three",
		"",
		"<!-- /card -->",
		"",
	].join("\n");

	await fs.writeFile(path.join(rootDir, "cards.md"), source, "utf8");

	const result = await initializeCardsRepository({
		rootDir,
		now: fixedNow,
		randomBytes: createRandomBytesStub(["deadbeef", "11223344", "55667788"]),
	});

	assert.equal(path.basename(result.logPath), FIXED_LOG_NAME);
	assert.equal(path.basename(result.backupPath), FIXED_BACKUP_NAME);
	assert.equal(result.repairs.length, 3);

	const repairedContents = await fs.readFile(
		path.join(rootDir, "cards.md"),
		"utf8",
	);
	const repaired = parseCardsFile(repairedContents);

	assert.equal(repaired.cards[0].metadata.id, "11223344");
	assert.equal(repaired.cards[0].metadata.difficulty, 3);
	assert.equal(repaired.cards[0].metadata.last_reviewed, "2026-04-26");

	assert.equal(repaired.cards[1].metadata.id, "deadbeef");
	assert.equal(repaired.cards[1].metadata.difficulty, 3);
	assert.equal(repaired.cards[1].metadata.last_reviewed, "2026-04-26");
	assert.equal(repaired.cards[1].metadata.extra_field, "keep-me");

	assert.equal(repaired.cards[2].metadata.id, "55667788");
	assert.equal(repaired.cards[2].metadata.difficulty, 3);
	assert.equal(repaired.cards[2].metadata.last_reviewed, "2026-04-26");

	const backupContents = await fs.readFile(
		path.join(rootDir, ".bak", FIXED_BACKUP_NAME),
		"utf8",
	);
	assert.equal(backupContents, source);

	const logContents = await readLog(rootDir);
	assert.match(
		logContents,
		/INFO repair\.card card_index=1 card_id=11223344 added=id,difficulty,last_reviewed/,
	);
	assert.match(
		logContents,
		/INFO repair\.card card_index=2 card_id=deadbeef added=last_reviewed/,
	);
	assert.match(
		logContents,
		/INFO repair\.card card_index=3 card_id=55667788 added=id,difficulty,last_reviewed/,
	);
	assert.match(
		logContents,
		/INFO startup\.ready file=cards\.md card_count=3 updated=3/,
	);
});
