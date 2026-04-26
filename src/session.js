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

function createSessionState(
	model,
	{ random = Math.random, now = () => new Date() } = {},
) {
	const filterDifficulty = normalizeDifficultyFilter(
		model?.frontmatter?.filter_difficulty,
	);
	const excludeReviewedToday =
		model?.frontmatter?.exclude_reviewed_today === true;
	const shuffle = model?.frontmatter?.shuffle === "yes" ? "yes" : "no";
	const today = formatCalendarDate(now());

	let cards = Array.isArray(model?.cards) ? model.cards.slice() : [];
	cards = cards.filter(
		(card) =>
			!isCardPaused(card?.metadata?.paused) &&
			matchesDifficulty(card, filterDifficulty) &&
			matchesReviewedTodayFilter(card, excludeReviewedToday, today),
	);

	if (shuffle === "yes") {
		cards = shuffleCards(cards, random);
	}

	return {
		card_ids: cards.map((card) => card.metadata.id),
		exclude_reviewed_today: excludeReviewedToday,
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
			exclude_reviewed_today: sessionState.exclude_reviewed_today === true,
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

function normalizeDifficultyFilter(filterDifficulty) {
	if (!Array.isArray(filterDifficulty)) {
		return null;
	}

	const normalized = filterDifficulty
		.map((value) => Number(value))
		.filter((value, index, values) => {
			return isCurrentDifficulty(value) && values.indexOf(value) === index;
		});

	return normalized.length > 0 ? normalized : null;
}

function matchesDifficulty(card, filterDifficulty) {
	if (filterDifficulty === null) {
		return true;
	}

	const difficulty = Number(card?.metadata?.difficulty);
	return filterDifficulty.includes(difficulty);
}

function matchesReviewedTodayFilter(card, excludeReviewedToday, today) {
	if (!excludeReviewedToday) {
		return true;
	}

	return card?.metadata?.last_reviewed !== today;
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
	setCardLastReviewed,
	toApiCard,
	updateCardDifficulty,
	writeCardsModel,
};
