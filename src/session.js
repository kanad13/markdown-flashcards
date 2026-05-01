const fs = require("node:fs/promises");

const { parseCardsFile, serializeCardsFile } = require("./cards-file");
const {
	DIFFICULTY_MAX,
	DIFFICULTY_MIN,
	isCurrentDifficulty,
} = require("./difficulty-scale");
const { formatCalendarDate } = require("./startup");

class SessionStateError extends Error {
	constructor(message, details = {}) {
		super(message);
		this.name = "SessionStateError";
		Object.assign(this, details);
	}
}

function createDeckPayload(model, { now = () => new Date() } = {}) {
	const cards = Array.isArray(model?.cards) ? model.cards : [];
	const today = formatCalendarDate(now());

	return {
		deck: {
			total_cards: cards.length,
			reviewed_today: countReviewedToday(cards, today),
			today,
		},
		cards: cards.map(toApiCard),
	};
}

function countReviewedToday(cards, today) {
	return (Array.isArray(cards) ? cards : []).filter(
		(card) => card?.metadata?.last_reviewed === today,
	).length;
}

function updateCardDifficulty(model, cardId, difficulty) {
	validateDifficulty(difficulty);
	const { card, cardIndex } = getCardById(model, cardId);

	const nextCard = {
		...card,
		metadata: {
			...card.metadata,
			difficulty,
		},
	};

	return {
		card: nextCard,
		cardIndex,
		model: replaceCard(model, cardIndex, nextCard),
	};
}

function markCardReviewed(model, cardId, { now = () => new Date() } = {}) {
	return setCardLastReviewed(model, cardId, formatCalendarDate(now()));
}

function setCardLastReviewed(model, cardId, lastReviewed) {
	validateCalendarDate(lastReviewed);
	const { card, cardIndex } = getCardById(model, cardId);

	const nextCard = {
		...card,
		metadata: {
			...card.metadata,
			last_reviewed: lastReviewed,
		},
	};

	return {
		card: nextCard,
		cardIndex,
		model: replaceCard(model, cardIndex, nextCard),
	};
}

async function writeCardsModel(cardsFilePath, model) {
	const serialized = serializeCardsFile(model);
	await fs.writeFile(cardsFilePath, serialized, "utf8");
	return parseCardsFile(serialized);
}

function getCardById(model, cardId) {
	const targetId = String(cardId);
	const cardIndex = (Array.isArray(model?.cards) ? model.cards : []).findIndex(
		(card) => String(card?.metadata?.id) === targetId,
	);

	if (cardIndex === -1) {
		throw new SessionStateError(`Card ${targetId} was not found.`, {
			code: "CARD_NOT_FOUND",
			statusCode: 404,
		});
	}

	return {
		card: model.cards[cardIndex],
		cardIndex,
	};
}

function toApiCard(card) {
	return {
		id: card.metadata.id,
		difficulty: card.metadata.difficulty,
		last_reviewed: card.metadata.last_reviewed,
		front: card.front,
		back: card.back,
	};
}

function replaceCard(model, cardIndex, nextCard) {
	const cards = model.cards.slice();
	cards[cardIndex] = nextCard;

	return {
		...model,
		cards,
	};
}

function validateDifficulty(difficulty) {
	if (!isCurrentDifficulty(difficulty)) {
		throw new SessionStateError(
			`difficulty must be an integer between ${DIFFICULTY_MIN} and ${DIFFICULTY_MAX}.`,
			{
				code: "INVALID_DIFFICULTY",
				statusCode: 400,
			},
		);
	}
}

function validateCalendarDate(lastReviewed) {
	if (
		typeof lastReviewed !== "string" ||
		!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(lastReviewed)
	) {
		throw new SessionStateError(
			"last_reviewed must be a YYYY-MM-DD date string.",
			{
				code: "INVALID_LAST_REVIEWED",
				statusCode: 400,
			},
		);
	}
}

module.exports = {
	SessionStateError,
	countReviewedToday,
	createDeckPayload,
	createSessionPayload: createDeckPayload,
	getCardById,
	markCardReviewed,
	setCardLastReviewed,
	toApiCard,
	updateCardDifficulty,
	writeCardsModel,
};
