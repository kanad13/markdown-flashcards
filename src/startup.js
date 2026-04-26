const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { parseCardsFile, serializeCardsFile } = require("./cards-file");
const { DEFAULT_DIFFICULTY } = require("./difficulty-scale");

class StartupValidationError extends Error {
	constructor(message, details = {}) {
		super(message);
		this.name = "StartupValidationError";
		Object.assign(this, details);
	}
}

async function initializeCardsRepository({
	rootDir,
	now = () => new Date(),
	randomBytes = crypto.randomBytes,
} = {}) {
	if (!rootDir) {
		throw new TypeError("rootDir is required");
	}

	const cardsFilePath = path.join(rootDir, "cards.md");
	const logsDir = path.join(rootDir, "logs");
	const runStartedAt = now();

	await fs.mkdir(logsDir, { recursive: true });

	const logger = createRunLogger({
		logsDir,
		runStartedAt,
		now,
	});

	await logger.info("startup.begin", { file: "cards.md" });

	const originalBuffer = await readCardsFile(cardsFilePath, logger);

	const backupPath = await createStartupBackup({
		rootDir,
		runStartedAt,
		originalBuffer,
		logger,
	});

	const originalText = originalBuffer.toString("utf8");

	if (originalText.trim() === "") {
		const error = new StartupValidationError("cards.md is empty.", {
			code: "EMPTY_CARDS_FILE",
		});
		await logger.error("startup.empty_cards", {
			file: "cards.md",
			reason: error.message,
		});
		throw error;
	}

	const parsed = await parseOrThrow({
		source: originalText,
		logger,
	});

	if (parsed.cards.length === 0) {
		const error = new StartupValidationError(
			"cards.md contains no parseable cards.",
			{
				code: "NO_PARSEABLE_CARDS",
			},
		);
		await logger.error("startup.no_cards", {
			file: "cards.md",
			reason: error.message,
		});
		throw error;
	}

	const repairResult = repairCardsModel(parsed, {
		now,
		randomBytes,
	});

	if (repairResult.repairs.length > 0) {
		try {
			await fs.writeFile(
				cardsFilePath,
				serializeCardsFile(repairResult.model),
				"utf8",
			);
		} catch (error) {
			await logger.error("repair.write_failed", {
				file: "cards.md",
				reason: error.message,
			});
			throw new StartupValidationError("Could not write repaired cards.md.", {
				code: "REPAIR_WRITE_FAILED",
				cause: error,
			});
		}

		for (const repair of repairResult.repairs) {
			await logger.info("repair.card", {
				card_index: repair.cardIndex + 1,
				card_id: repair.cardId,
				added: repair.added.join(","),
			});
		}
	}

	await logger.info("startup.ready", {
		file: "cards.md",
		card_count: repairResult.model.cards.length,
		updated: repairResult.repairs.length,
	});

	return {
		backupPath,
		cardsFilePath,
		logPath: logger.logPath,
		model: repairResult.model,
		repairs: repairResult.repairs,
	};
}

async function readCardsFile(cardsFilePath, logger) {
	try {
		return await fs.readFile(cardsFilePath);
	} catch (error) {
		if (error && error.code === "ENOENT") {
			const wrappedError = new StartupValidationError("cards.md is missing.", {
				code: "CARDS_FILE_MISSING",
			});
			await logger.error("startup.missing_cards", {
				file: "cards.md",
				reason: wrappedError.message,
			});
			throw wrappedError;
		}

		await logger.error("startup.read_failed", {
			file: "cards.md",
			reason: error.message,
		});

		throw error;
	}
}

async function parseOrThrow({ source, logger }) {
	try {
		return parseCardsFile(source);
	} catch (error) {
		const event =
			error.cardIndex === undefined
				? "startup.invalid_file"
				: "startup.invalid_card";
		const fields = {
			file: "cards.md",
			reason: error.message,
		};

		if (error.cardIndex !== undefined) {
			fields.card_index = error.cardIndex + 1;
		}

		await logger.error(event, fields);

		throw new StartupValidationError(error.message, {
			code: "INVALID_CARDS_FILE",
			cause: error,
		});
	}
}

async function createStartupBackup({
	rootDir,
	runStartedAt,
	originalBuffer,
	logger,
}) {
	const backupDir = path.join(rootDir, ".bak");
	const backupPath = path.join(
		backupDir,
		`${formatFilenameTimestamp(runStartedAt)}-cards.md.bak`,
	);

	try {
		await fs.mkdir(backupDir, { recursive: true });
		await fs.writeFile(backupPath, originalBuffer);
	} catch (error) {
		await logger.error("backup.failed", {
			file: path.relative(rootDir, backupPath),
			reason: error.message,
		});
		throw new StartupValidationError("Could not create startup backup.", {
			code: "BACKUP_FAILED",
			cause: error,
		});
	}

	await logger.info("backup.created", {
		file: path.relative(rootDir, backupPath),
	});

	return backupPath;
}

function repairCardsModel(
	model,
	{ now = () => new Date(), randomBytes = crypto.randomBytes } = {},
) {
	const today = formatCalendarDate(now());
	const existingIds = new Set();

	for (const card of model.cards) {
		const cardId = card?.metadata?.id;
		if (typeof cardId === "string" && cardId.trim() !== "") {
			existingIds.add(cardId);
		}
	}

	const repairs = [];
	const cards = model.cards.map((card, cardIndex) => {
		const metadata = { ...card.metadata };
		const added = [];

		if (isMissingValue(metadata.id)) {
			metadata.id = generateUniqueCardId(existingIds, randomBytes);
			added.push("id");
		}

		if (isMissingValue(metadata.difficulty)) {
			metadata.difficulty = DEFAULT_DIFFICULTY;
			added.push("difficulty");
		}

		if (isMissingValue(metadata.last_reviewed)) {
			metadata.last_reviewed = today;
			added.push("last_reviewed");
		}

		if (isMissingValue(metadata.paused)) {
			metadata.paused = "no";
			added.push("paused");
		}

		if (added.length === 0) {
			return card;
		}

		repairs.push({
			cardIndex,
			cardId: metadata.id,
			added,
		});

		return {
			...card,
			metadata,
		};
	});

	return {
		model: {
			...model,
			cards,
		},
		repairs,
	};
}

function generateUniqueCardId(existingIds, randomBytes) {
	let nextId;

	do {
		nextId = randomBytes(4).toString("hex");
	} while (existingIds.has(nextId));

	existingIds.add(nextId);
	return nextId;
}

function createRunLogger({ logsDir, runStartedAt, now }) {
	const logPath = path.join(
		logsDir,
		`${formatFilenameTimestamp(runStartedAt)}.log`,
	);

	return {
		logPath,
		info(event, fields) {
			return writeLogLine({ logPath, level: "INFO", event, fields, now });
		},
		warn(event, fields) {
			return writeLogLine({ logPath, level: "WARN", event, fields, now });
		},
		error(event, fields) {
			return writeLogLine({ logPath, level: "ERROR", event, fields, now });
		},
	};
}

function writeLogLine({ logPath, level, event, fields = {}, now }) {
	const timestamp = now().toISOString();
	const serializedFields = Object.entries(fields)
		.map(([key, value]) => `${key}=${formatLogFieldValue(value)}`)
		.join(" ");

	const line = [`[${timestamp}]`, level, event, serializedFields]
		.filter(Boolean)
		.join(" ")
		.trimEnd();

	return fs.appendFile(logPath, `${line}\n`, "utf8");
}

function formatLogFieldValue(value) {
	if (value === null || value === undefined) {
		return "null";
	}

	const stringValue = String(value);

	if (/^[A-Za-z0-9._/:,-]+$/.test(stringValue)) {
		return stringValue;
	}

	return JSON.stringify(stringValue);
}

function formatFilenameTimestamp(date) {
	return date
		.toISOString()
		.replace(/\.\d{3}Z$/, "")
		.replace(/:/g, "-");
}

function formatCalendarDate(date) {
	return date.toISOString().slice(0, 10);
}

function isMissingValue(value) {
	return (
		value === undefined ||
		value === null ||
		(typeof value === "string" && value.trim() === "")
	);
}

module.exports = {
	StartupValidationError,
	formatCalendarDate,
	formatFilenameTimestamp,
	generateUniqueCardId,
	initializeCardsRepository,
	repairCardsModel,
};
