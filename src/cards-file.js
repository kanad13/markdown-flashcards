const { isDeepStrictEqual } = require("node:util");

const yaml = require("js-yaml");

const CARD_START = "<!-- card -->";
const CARD_END = "<!-- /card -->";
const FRONT_HEADING = "## Front";
const BACK_HEADING = "## Back";
const YAML_FENCE_OPEN = "```yaml";
const YAML_FENCE_CLOSE = "```";

class CardsFileParseError extends Error {
	constructor(message, details = {}) {
		super(message);
		this.name = "CardsFileParseError";
		Object.assign(this, details);
	}
}

function parseCardsFile(input) {
	if (typeof input !== "string") {
		throw new TypeError("cards.md contents must be provided as a string");
	}

	const hasTrailingNewline = /\r?\n$/.test(input);
	const source = input.startsWith("\ufeff") ? input.slice(1) : input;
	const lines = splitLines(source);
	const preambleResult = parseFilePreamble(lines);
	const cards = parseCards(lines, preambleResult.nextLineIndex);

	return {
		hasTrailingNewline,
		cards,
	};
}

function serializeCardsFile(model) {
	if (!model || typeof model !== "object") {
		throw new TypeError("cards file model must be an object");
	}

	const cards = Array.isArray(model.cards) ? model.cards : [];
	const output = [];

	for (const [index, card] of cards.entries()) {
		const normalizedCard = normalizeCardForSerialization(card, index);

		if (output.length > 0) {
			output.push("");
		}
		output.push(CARD_START);
		output.push("");

		if (Object.keys(normalizedCard.metadata).length > 0) {
			output.push(
				...renderYamlFence(
					normalizedCard.metadata,
					normalizedCard.rawMetadataYaml,
				),
			);
			output.push("");
		}

		output.push(FRONT_HEADING);
		output.push(...bodyToLines(normalizedCard.front));
		output.push(BACK_HEADING);
		output.push(...bodyToLines(normalizedCard.back));
		output.push(CARD_END);
	}

	const serialized = output.join("\n");
	return model.hasTrailingNewline === false ? serialized : `${serialized}\n`;
}

function parseFilePreamble(lines) {
	let cursor = skipBlankLines(lines, 0);

	if (cursor < lines.length && lines[cursor] === YAML_FENCE_OPEN) {
		const closingLineIndex = findClosingYamlFence(
			lines,
			cursor,
			"legacy file-level settings",
		);

		cursor = skipBlankLines(lines, closingLineIndex + 1);
	}

	return {
		nextLineIndex: cursor,
	};
}

function parseCards(lines, startLineIndex) {
	const cards = [];
	let cursor = startLineIndex;

	while (cursor < lines.length) {
		if (lines[cursor].trim() === "") {
			cursor += 1;
			continue;
		}

		if (lines[cursor] === CARD_END) {
			throw createParseError(
				"Encountered a closing card marker without a matching opening card marker.",
				{
					code: "UNEXPECTED_CARD_CLOSE",
					line: cursor + 1,
				},
			);
		}

		if (lines[cursor] !== CARD_START) {
			throw createParseError("Found unexpected content outside a card block.", {
				code: "UNEXPECTED_CONTENT",
				line: cursor + 1,
			});
		}

		const parsedCard = parseCard(lines, cursor, cards.length);
		cards.push(parsedCard.card);
		cursor = parsedCard.nextLineIndex;
	}

	return cards;
}

function parseCard(lines, cardStartLineIndex, cardIndex) {
	let closingLineIndex = -1;

	for (let index = cardStartLineIndex + 1; index < lines.length; index += 1) {
		if (lines[index] === CARD_START) {
			throw createParseError("Card blocks cannot be nested or overlapped.", {
				code: "NESTED_CARD_BLOCK",
				line: index + 1,
				cardIndex,
			});
		}

		if (lines[index] === CARD_END) {
			closingLineIndex = index;
			break;
		}
	}

	if (closingLineIndex === -1) {
		throw createParseError("Card block was opened but never closed.", {
			code: "UNCLOSED_CARD_BLOCK",
			line: cardStartLineIndex + 1,
			cardIndex,
		});
	}

	const innerLines = lines.slice(cardStartLineIndex + 1, closingLineIndex);
	const lineOffset = cardStartLineIndex + 2;
	const parsedContent = parseCardContent(innerLines, {
		cardIndex,
		lineOffset,
	});

	return {
		card: {
			index: cardIndex,
			metadata: parsedContent.metadata,
			rawMetadataYaml: parsedContent.rawMetadataYaml,
			front: parsedContent.front,
			back: parsedContent.back,
		},
		nextLineIndex: closingLineIndex + 1,
	};
}

function parseCardContent(lines, context) {
	const headings = collectSectionHeadings(lines);
	const frontHeadings = headings.filter((heading) => heading.type === "front");
	const backHeadings = headings.filter((heading) => heading.type === "back");

	if (frontHeadings.length !== 1) {
		throw createParseError(
			"Each card must contain exactly one ## Front heading.",
			{
				code: "INVALID_FRONT_SECTION_COUNT",
				line: context.lineOffset,
				cardIndex: context.cardIndex,
			},
		);
	}

	if (backHeadings.length !== 1) {
		throw createParseError(
			"Each card must contain exactly one ## Back heading.",
			{
				code: "INVALID_BACK_SECTION_COUNT",
				line: context.lineOffset,
				cardIndex: context.cardIndex,
			},
		);
	}

	const frontHeading = frontHeadings[0];
	const backHeading = backHeadings[0];

	if (backHeading.index <= frontHeading.index) {
		throw createParseError("Each card must place ## Back after ## Front.", {
			code: "INVALID_SECTION_ORDER",
			line: context.lineOffset + backHeading.index,
			cardIndex: context.cardIndex,
		});
	}

	const metadataResult = parseOptionalCardMetadata(
		lines.slice(0, frontHeading.index),
		context,
	);
	const front = lines
		.slice(frontHeading.index + 1, backHeading.index)
		.join("\n");
	const back = lines.slice(backHeading.index + 1).join("\n");

	return {
		metadata: metadataResult.metadata,
		rawMetadataYaml: metadataResult.rawMetadataYaml,
		front,
		back,
	};
}

function collectSectionHeadings(lines) {
	const headings = [];
	let activeFence = null;

	for (const [index, line] of lines.entries()) {
		const fenceToken = parseFenceToken(line);

		if (fenceToken) {
			if (!activeFence) {
				activeFence = fenceToken;
			} else if (
				activeFence.character === fenceToken.character &&
				fenceToken.length >= activeFence.length
			) {
				activeFence = null;
			}
			continue;
		}

		if (activeFence) {
			continue;
		}

		if (line === FRONT_HEADING) {
			headings.push({ type: "front", index });
		}

		if (line === BACK_HEADING) {
			headings.push({ type: "back", index });
		}
	}

	return headings;
}

function parseOptionalCardMetadata(lines, context) {
	let cursor = 0;

	while (cursor < lines.length && lines[cursor].trim() === "") {
		cursor += 1;
	}

	if (cursor === lines.length) {
		return {
			metadata: {},
			rawMetadataYaml: null,
		};
	}

	if (lines[cursor] !== YAML_FENCE_OPEN) {
		throw createParseError(
			"Only an optional fenced yaml metadata block may appear before ## Front.",
			{
				code: "INVALID_PRE_FRONT_CONTENT",
				line: context.lineOffset + cursor,
				cardIndex: context.cardIndex,
			},
		);
	}

	const closingLineIndex = findClosingYamlFence(lines, cursor, "card metadata");
	const rawYaml = lines.slice(cursor + 1, closingLineIndex).join("\n");
	const metadata = loadYamlMap(rawYaml, {
		context: "card metadata",
		line: context.lineOffset + cursor,
	});

	cursor = skipBlankLines(lines, closingLineIndex + 1);

	if (cursor !== lines.length) {
		throw createParseError(
			"Only an optional fenced yaml metadata block may appear before ## Front.",
			{
				code: "INVALID_PRE_FRONT_CONTENT",
				line: context.lineOffset + cursor,
				cardIndex: context.cardIndex,
			},
		);
	}

	return {
		metadata,
		rawMetadataYaml: rawYaml,
	};
}

function normalizeCardForSerialization(card, index) {
	if (!card || typeof card !== "object") {
		throw new TypeError(`card at index ${index} must be an object`);
	}

	return {
		metadata: asPlainObject(
			card.metadata ?? {},
			`card metadata at index ${index}`,
		),
		rawMetadataYaml:
			typeof card.rawMetadataYaml === "string" ? card.rawMetadataYaml : null,
		front: typeof card.front === "string" ? card.front : "",
		back: typeof card.back === "string" ? card.back : "",
	};
}

function renderYamlFence(data, rawYaml) {
	const lines = [YAML_FENCE_OPEN];
	const reusableRawYaml = canReuseRawYaml(rawYaml, data)
		? rawYaml
		: dumpYamlMap(data);

	if (reusableRawYaml.length > 0) {
		lines.push(...reusableRawYaml.split("\n"));
	}

	lines.push(YAML_FENCE_CLOSE);
	return lines;
}

function canReuseRawYaml(rawYaml, currentValue) {
	if (typeof rawYaml !== "string") {
		return false;
	}

	try {
		const parsedRawYaml = loadYamlMap(rawYaml, {
			context: "yaml block",
			line: 1,
		});
		return isDeepStrictEqual(parsedRawYaml, currentValue);
	} catch {
		return false;
	}
}

function dumpYamlMap(value) {
	return yaml
		.dump(value, {
			schema: yaml.JSON_SCHEMA,
			noCompatMode: true,
			lineWidth: -1,
			sortKeys: false,
		})
		.trimEnd();
}

function loadYamlMap(rawYaml, context) {
	try {
		const parsed =
			rawYaml.trim() === ""
				? {}
				: yaml.load(rawYaml, { schema: yaml.JSON_SCHEMA });

		if (parsed === null || typeof parsed === "undefined") {
			return {};
		}

		if (!isPlainObject(parsed)) {
			throw createParseError(
				`${context.context} must contain a YAML mapping.`,
				{
					code: "INVALID_YAML_MAPPING",
					line: context.line,
				},
			);
		}

		return parsed;
	} catch (error) {
		if (error instanceof CardsFileParseError) {
			throw error;
		}

		throw createParseError(
			`Could not parse ${context.context}: ${error.message}`,
			{
				code: "INVALID_YAML",
				line: context.line,
				cause: error,
			},
		);
	}
}

function findClosingYamlFence(lines, openingLineIndex, context) {
	for (let index = openingLineIndex + 1; index < lines.length; index += 1) {
		if (lines[index] === YAML_FENCE_CLOSE) {
			return index;
		}
	}

	throw createParseError(`The ${context} fence is not closed.`, {
		code: "UNCLOSED_YAML_FENCE",
		line: openingLineIndex + 1,
	});
}

function splitLines(value) {
	return value.split(/\r?\n/);
}

function skipBlankLines(lines, startIndex) {
	let cursor = startIndex;

	while (cursor < lines.length && lines[cursor].trim() === "") {
		cursor += 1;
	}

	return cursor;
}

function parseFenceToken(line) {
	const match = line.match(/^(`{3,}|~{3,})([^`]*)?$/);

	if (!match) {
		return null;
	}

	return {
		character: match[1][0],
		length: match[1].length,
	};
}

function bodyToLines(body) {
	if (body === "") {
		return [];
	}

	return body.split("\n");
}

function createParseError(message, details) {
	return new CardsFileParseError(message, details);
}

function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asPlainObject(value, label) {
	if (!isPlainObject(value)) {
		throw new TypeError(`${label} must be an object`);
	}

	return value;
}

module.exports = {
	BACK_HEADING,
	CARD_END,
	CARD_START,
	CardsFileParseError,
	FRONT_HEADING,
	parseCardsFile,
	serializeCardsFile,
	YAML_FENCE_CLOSE,
	YAML_FENCE_OPEN,
};
