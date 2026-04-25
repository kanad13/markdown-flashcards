const fs = require("node:fs/promises");

const { parseCardsFile, serializeCardsFile } = require("./cards-file");
const { formatCalendarDate } = require("./startup");

class SessionStateError extends Error {
	constructor(message, details = {}) {
		super(message);
		this.name = "SessionStateError";
		Object.assign(this, details);
	}
}

function createSessionState(model, { random = Math.random } = {}) {
	const filterDifficulty = normalizeDifficultyFilter(
		model?.frontmatter?.filter_difficulty,
	);
	const shuffle = model?.frontmatter?.shuffle === "yes" ? "yes" : "no";

	let cards = Array.isArray(model?.cards) ? model.cards.slice() : [];
	cards = cards.filter(
		(card) =>
			!isCardPaused(card?.metadata?.paused) &&
			matchesDifficulty(card, filterDifficulty),
	);

	if (shuffle === "yes") {
		cards = shuffleCards(cards, random);
	}

	return {
		card_ids: cards.map((card) => card.metadata.id),
		filter_difficulty: filterDifficulty,
		shuffle,
	};
}

function createSessionPayload(
	model,
	sessionState,
	{ now = () => new Date() } = {},
) {
	const cards = getSessionCards(model, sessionState);
	const today = formatCalendarDate(now());
	const reviewedToday = cards.filter(
		(card) => card?.metadata?.last_reviewed === today,
	).length;

	return {
		session: {
			card_ids: sessionState.card_ids.slice(),
			filter_difficulty: Array.isArray(sessionState.filter_difficulty)
				? sessionState.filter_difficulty.slice()
				: null,
			shuffle: sessionState.shuffle,
			total_cards: cards.length,
			reviewed_today: reviewedToday,
		},
		cards: cards.map(toApiCard),
	};
}

function getSessionCards(model, sessionState) {
	const cardsById = new Map(
		(Array.isArray(model?.cards) ? model.cards : []).map((card) => [
			String(card?.metadata?.id),
			card,
		]),
	);

	return (sessionState?.card_ids ?? [])
		.map((cardId) => cardsById.get(String(cardId)))
		.filter(Boolean);
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
	const { card, cardIndex } = getCardById(model, cardId);
	const lastReviewed = formatCalendarDate(now());

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
		paused: card.metadata.paused,
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
	if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10) {
		throw new SessionStateError(
			"difficulty must be an integer between 1 and 10.",
			{
				code: "INVALID_DIFFICULTY",
				statusCode: 400,
			},
		);
	}
}

function normalizeDifficultyFilter(filterDifficulty) {
	if (!Array.isArray(filterDifficulty)) {
		return null;
	}

	return filterDifficulty
		.map((value) => Number(value))
		.filter((value) => Number.isInteger(value));
}

function matchesDifficulty(card, filterDifficulty) {
	if (filterDifficulty === null) {
		return true;
	}

	const difficulty = Number(card?.metadata?.difficulty);
	return filterDifficulty.includes(difficulty);
}

function isCardPaused(paused) {
	return paused === "yes";
}

function shuffleCards(cards, random) {
	const shuffled = cards.slice();

	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		const current = shuffled[index];
		shuffled[index] = shuffled[swapIndex];
		shuffled[swapIndex] = current;
	}

	return shuffled;
}

module.exports = {
	SessionStateError,
	createSessionPayload,
	createSessionState,
	getCardById,
	getSessionCards,
	markCardReviewed,
	toApiCard,
	updateCardDifficulty,
	writeCardsModel,
};
