(function bootstrapModule(globalScope) {
	"use strict";

	const APP_INFO = Object.freeze({
		sourceFileLabel: "cards.md",
	});

	const UI_LABELS = Object.freeze({
		guideToggle: Object.freeze({
			show: "Show guide",
			hide: "Hide guide",
		}),
		sessionInfoToggle: Object.freeze({
			show: "Show session settings",
			hide: "Hide session settings",
		}),
	});

	const DIFFICULTY_VALUES = Object.freeze([0, 1, 2, 3, 4, 5]);
	const STUDY_DIFFICULTY_VALUES = Object.freeze([1, 2, 3, 4, 5]);
	const DEFAULT_DIFFICULTY = 3;
	const DEFAULT_VIEW_SETTINGS = Object.freeze({
		order: "shuffle",
		showReviewedToday: true,
		visibleDifficulties: STUDY_DIFFICULTY_VALUES.slice(),
	});
	const KATEX_DELIMITERS = Object.freeze([
		{ left: "$$", right: "$$", display: true },
		{ left: "\\[", right: "\\]", display: true },
		{ left: "$", right: "$", display: false },
		{ left: "\\(", right: "\\)", display: false },
	]);
	const MERMAID_CONFIG = Object.freeze({
		startOnLoad: false,
		securityLevel: "strict",
		theme: "neutral",
		flowchart: Object.freeze({
			htmlLabels: false,
		}),
	});

	const API_ROUTES = {
		session: "/api/session",
		difficulty(cardId) {
			return `/api/cards/${encodeURIComponent(cardId)}/difficulty`;
		},
		review(cardId) {
			return `/api/cards/${encodeURIComponent(cardId)}/review`;
		},
	};

	function formatStackMode(order) {
		return order === "shuffle" || order === "yes"
			? "Shuffled view"
			: "File order";
	}

	function formatDifficultyLabel(value) {
		return Number(value) === 0 ? "Skip" : String(value);
	}

	function formatDifficultyOptionLabel(value) {
		return Number(value) === 0 ? "Skip (0)" : String(value);
	}

	function formatTimerText(milliseconds) {
		const safeMilliseconds = Number.isFinite(milliseconds)
			? Math.max(0, milliseconds)
			: 0;
		const totalSeconds = Math.floor(safeMilliseconds / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		if (hours > 0) {
			return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
		}

		return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	function formatElapsedTimer(startedAt, nowMs = Date.now()) {
		if (!Number.isFinite(startedAt)) {
			return "00:00";
		}

		return formatTimerText(nowMs - startedAt);
	}

	function formatDisplayDate(dateString) {
		if (typeof dateString !== "string" || dateString.trim() === "") {
			return null;
		}

		const parsedDate = new Date(`${dateString}T00:00:00.000Z`);

		if (Number.isNaN(parsedDate.getTime())) {
			return null;
		}

		return new Intl.DateTimeFormat("en", {
			month: "short",
			day: "numeric",
			year: "numeric",
			timeZone: "UTC",
		}).format(parsedDate);
	}

	function getTodayKey(date = new Date()) {
		return date.toISOString().slice(0, 10);
	}

	function formatLastReviewedValue(lastReviewed, todayKey = getTodayKey()) {
		if (typeof lastReviewed !== "string" || lastReviewed.trim() === "") {
			return "Not yet";
		}

		if (lastReviewed === todayKey) {
			return "Today";
		}

		return formatDisplayDate(lastReviewed) ?? lastReviewed;
	}

	function isCardReviewedToday(card, todayKey = getTodayKey()) {
		return Boolean(card && card.last_reviewed === todayKey);
	}

	function countReviewedToday(cards, todayKey = getTodayKey()) {
		return (Array.isArray(cards) ? cards : []).filter((card) => {
			return isCardReviewedToday(card, todayKey);
		}).length;
	}

	function countSkippedCards(cards) {
		return (Array.isArray(cards) ? cards : []).filter((card) => {
			return Number(card?.difficulty) === 0;
		}).length;
	}

	function normalizeDifficultyValue(value, fallback = DEFAULT_DIFFICULTY) {
		const number = Number(value);
		return DIFFICULTY_VALUES.includes(number) ? number : fallback;
	}

	function normalizeCard(card) {
		return {
			id: String(card?.id ?? ""),
			difficulty: normalizeDifficultyValue(card?.difficulty),
			last_reviewed:
				typeof card?.last_reviewed === "string" ? card.last_reviewed : "",
			front: typeof card?.front === "string" ? card.front : "",
			back: typeof card?.back === "string" ? card.back : "",
		};
	}

	function normalizeCards(cards) {
		return (Array.isArray(cards) ? cards : []).map(normalizeCard);
	}

	function normalizeVisibleDifficulties(values) {
		if (!Array.isArray(values)) {
			return STUDY_DIFFICULTY_VALUES.slice();
		}

		return [...new Set(values.map((value) => Number(value)))]
			.filter((value) => DIFFICULTY_VALUES.includes(value))
			.sort((left, right) => left - right);
	}

	function normalizeViewSettings(settings) {
		const hasVisibleDifficulties = Boolean(
			settings &&
			Object.prototype.hasOwnProperty.call(settings, "visibleDifficulties"),
		);

		return {
			order: settings?.order === "file" ? "file" : DEFAULT_VIEW_SETTINGS.order,
			showReviewedToday: settings?.showReviewedToday !== false,
			visibleDifficulties: hasVisibleDifficulties
				? normalizeVisibleDifficulties(settings.visibleDifficulties)
				: DEFAULT_VIEW_SETTINGS.visibleDifficulties.slice(),
		};
	}

	function createShuffledCardIds(cards, random = Math.random) {
		const ids = (Array.isArray(cards) ? cards : []).map((card) => card.id);

		for (let index = ids.length - 1; index > 0; index -= 1) {
			const swapIndex = Math.floor(random() * (index + 1));
			const current = ids[index];
			ids[index] = ids[swapIndex];
			ids[swapIndex] = current;
		}

		return ids;
	}

	function getCardsById(state) {
		return new Map(
			(Array.isArray(state?.allCards) ? state.allCards : []).map((card) => [
				card.id,
				card,
			]),
		);
	}

	function getOrderedCardIds(state) {
		const fileOrderIds = (
			Array.isArray(state?.allCards) ? state.allCards : []
		).map((card) => card.id);

		if (state?.viewSettings?.order !== "shuffle") {
			return fileOrderIds;
		}

		const knownIds = new Set(fileOrderIds);
		const shuffledIds = Array.isArray(state?.shuffledCardIds)
			? state.shuffledCardIds.filter((id) => knownIds.has(id))
			: [];
		const shuffledSet = new Set(shuffledIds);

		return shuffledIds.concat(
			fileOrderIds.filter((id) => !shuffledSet.has(id)),
		);
	}

	function getOrderedCards(state) {
		const cardsById = getCardsById(state);
		return getOrderedCardIds(state)
			.map((cardId) => cardsById.get(cardId))
			.filter(Boolean);
	}

	function matchesViewSettings(card, viewSettings, todayKey = getTodayKey()) {
		const settings = normalizeViewSettings(viewSettings);
		const difficulty = normalizeDifficultyValue(card?.difficulty);

		if (!settings.visibleDifficulties.includes(difficulty)) {
			return false;
		}

		if (
			settings.showReviewedToday === false &&
			isCardReviewedToday(card, todayKey)
		) {
			return false;
		}

		return true;
	}

	function getVisibleCards(state, todayKey = getTodayKey()) {
		return getOrderedCards(state).filter((card) => {
			return matchesViewSettings(card, state?.viewSettings, todayKey);
		});
	}

	function getVisibleCardIds(state, todayKey = getTodayKey()) {
		return getVisibleCards(state, todayKey).map((card) => card.id);
	}

	function getCurrentVisibleIndex(state, todayKey = getTodayKey()) {
		return getVisibleCardIds(state, todayKey).indexOf(
			state?.currentCardId ?? null,
		);
	}

	function reconcileCurrentCardId(
		state,
		previousCardId = state?.currentCardId ?? null,
		todayKey = getTodayKey(),
	) {
		const visibleIds = getVisibleCardIds(state, todayKey);

		if (visibleIds.length === 0) {
			return null;
		}

		if (previousCardId && visibleIds.includes(previousCardId)) {
			return previousCardId;
		}

		const orderedIds = getOrderedCardIds(state);
		const visibleIdSet = new Set(visibleIds);
		const previousIndex = previousCardId
			? orderedIds.indexOf(previousCardId)
			: -1;

		if (previousIndex >= 0) {
			for (
				let index = previousIndex + 1;
				index < orderedIds.length;
				index += 1
			) {
				if (visibleIdSet.has(orderedIds[index])) {
					return orderedIds[index];
				}
			}

			for (let index = previousIndex - 1; index >= 0; index -= 1) {
				if (visibleIdSet.has(orderedIds[index])) {
					return orderedIds[index];
				}
			}
		}

		return visibleIds[0];
	}

	function finalizeSelectionState(
		state,
		{
			previousCardId = state?.currentCardId ?? null,
			nowMs = Date.now(),
			todayKey = getTodayKey(),
		} = {},
	) {
		const nextCurrentCardId = reconcileCurrentCardId(
			state,
			previousCardId,
			todayKey,
		);
		const currentChanged = nextCurrentCardId !== previousCardId;
		const hasCurrentCard = Boolean(nextCurrentCardId);

		return {
			...state,
			currentCardId: nextCurrentCardId,
			cardStartedAt:
				hasCurrentCard && Number.isFinite(state?.sessionStartedAt)
					? currentChanged || !Number.isFinite(state?.cardStartedAt)
						? nowMs
						: state.cardStartedAt
					: null,
			isBackVisible:
				hasCurrentCard && !currentChanged
					? state?.isBackVisible === true
					: false,
		};
	}

	function formatCurrentCardLabel(session, currentIndex, fallbackLabel = "—") {
		const totalCards = Number.isInteger(session?.total_cards)
			? session.total_cards
			: 0;

		if (totalCards <= 0 || currentIndex < 0) {
			return fallbackLabel;
		}

		return `${Math.min(currentIndex + 1, totalCards)} of ${totalCards}`;
	}

	function formatProgressText(session, currentIndex) {
		const totalCards = Number.isInteger(session?.total_cards)
			? session.total_cards
			: 0;
		const cardPosition =
			totalCards > 0 && currentIndex >= 0 ? currentIndex + 1 : 0;
		const reviewedToday = Number.isInteger(session?.reviewed_today)
			? session.reviewed_today
			: 0;

		return `Card ${cardPosition} of ${totalCards} · ${reviewedToday} reviewed today`;
	}

	function formatFilterLabel(filterDifficulty) {
		const normalizedFilter = normalizeVisibleDifficulties(filterDifficulty);

		if (normalizedFilter.length === 0) {
			return "No difficulties";
		}

		if (
			normalizedFilter.length === STUDY_DIFFICULTY_VALUES.length &&
			normalizedFilter.every(
				(value, index) => value === STUDY_DIFFICULTY_VALUES[index],
			)
		) {
			return "Study cards";
		}

		if (
			normalizedFilter.length === DIFFICULTY_VALUES.length &&
			normalizedFilter.every(
				(value, index) => value === DIFFICULTY_VALUES[index],
			)
		) {
			return "All difficulty levels";
		}

		return normalizedFilter.map(formatDifficultyOptionLabel).join(", ");
	}

	function formatReviewedFilterLabel(showReviewedToday) {
		return showReviewedToday === false ? "Hides reviewed today" : null;
	}

	function formatSessionFilterSummary(viewSettings) {
		return [
			formatFilterLabel(viewSettings?.visibleDifficulties),
			formatReviewedFilterLabel(viewSettings?.showReviewedToday),
		]
			.filter(Boolean)
			.join(" · ");
	}

	function normalizeSession(session, fallbackTotal = 0) {
		return {
			total_cards: Number.isInteger(session?.total_cards)
				? session.total_cards
				: fallbackTotal,
			reviewed_today: Number.isInteger(session?.reviewed_today)
				? session.reviewed_today
				: 0,
		};
	}

	function getVisibleSessionSummary(state, todayKey = getTodayKey()) {
		const visibleCards = getVisibleCards(state, todayKey);
		const allCards = Array.isArray(state?.allCards) ? state.allCards : [];

		return {
			total_cards: visibleCards.length,
			reviewed_today: countReviewedToday(allCards, todayKey),
			deck_cards: allCards.length,
			skipped_cards: countSkippedCards(allCards),
		};
	}

	function getCurrentCard(state, todayKey = getTodayKey()) {
		if (!state?.currentCardId) {
			return null;
		}

		const visibleIdSet = new Set(getVisibleCardIds(state, todayKey));

		if (!visibleIdSet.has(state.currentCardId)) {
			return null;
		}

		return getCardsById(state).get(state.currentCardId) ?? null;
	}

	function getCurrentCardSummary(
		state,
		nowMs = Date.now(),
		todayKey = getTodayKey(),
	) {
		const currentCard = getCurrentCard(state, todayKey);
		const sessionSummary = getVisibleSessionSummary(state, todayKey);
		const currentIndex = getCurrentVisibleIndex(state, todayKey);
		const fallbackLabel =
			state?.statusMessage === "Loading session…" ? "Loading…" : "No cards";

		return {
			position: formatCurrentCardLabel(
				sessionSummary,
				currentIndex,
				fallbackLabel,
			),
			reviewed: currentCard
				? formatLastReviewedValue(currentCard.last_reviewed, todayKey)
				: "—",
			cardTimer: formatElapsedTimer(state?.cardStartedAt, nowMs),
			sessionTimer: formatElapsedTimer(state?.sessionStartedAt, nowMs),
		};
	}

	function ensureStudyTimersStarted(state, nowMs = Date.now()) {
		if (!Number.isFinite(nowMs)) {
			return state;
		}

		const hasCurrentCard = Boolean(getCurrentCard(state));

		return {
			...state,
			sessionStartedAt: Number.isFinite(state?.sessionStartedAt)
				? state.sessionStartedAt
				: nowMs,
			cardStartedAt:
				hasCurrentCard && !Number.isFinite(state?.cardStartedAt)
					? nowMs
					: (state?.cardStartedAt ?? null),
		};
	}

	function createInitialState(payload = {}, { random = Math.random } = {}) {
		const allCards = normalizeCards(payload.cards);
		const baseState = {
			allCards,
			shuffledCardIds: createShuffledCardIds(allCards, random),
			viewSettings: normalizeViewSettings(payload.viewSettings),
			reviewUndoDates: {},
			currentCardId: allCards[0]?.id ?? null,
			sessionStartedAt: null,
			cardStartedAt: null,
			isBackVisible: false,
			isOverviewVisible: true,
			isSessionBoxExpanded: false,
			busyAction: null,
			errorMessage: "",
			statusMessage: "Loading session…",
		};

		return finalizeSelectionState(baseState, {
			previousCardId: baseState.currentCardId,
			nowMs: 0,
		});
	}

	function setOverviewVisibility(state, isOverviewVisible) {
		const hasCards = getVisibleCards(state).length > 0;

		return {
			...state,
			isOverviewVisible,
			statusMessage: isOverviewVisible
				? "Guide open. Live settings stay ready."
				: hasCards
					? "Study mode ready. Front content is shown by default."
					: "Study mode open. No cards match the current live settings.",
		};
	}

	function setSessionBoxExpanded(state, isSessionBoxExpanded) {
		return {
			...state,
			isSessionBoxExpanded,
		};
	}

	function formatGuideToggleLabel(isGuideVisible) {
		return isGuideVisible
			? UI_LABELS.guideToggle.hide
			: UI_LABELS.guideToggle.show;
	}

	function formatSessionToggleLabel(isSessionInfoVisible) {
		return isSessionInfoVisible
			? UI_LABELS.sessionInfoToggle.hide
			: UI_LABELS.sessionInfoToggle.show;
	}

	function canUndoReview(state, card = getCurrentCard(state)) {
		return Boolean(
			card &&
			state?.reviewUndoDates &&
			Object.prototype.hasOwnProperty.call(state.reviewUndoDates, card.id),
		);
	}

	function buildDifficultyOptions(selectedDifficulty) {
		return DIFFICULTY_VALUES.map((value) => {
			return {
				value,
				label: formatDifficultyOptionLabel(value),
				selected: value === Number(selectedDifficulty),
			};
		});
	}

	function getSessionProgress(session, currentIndex) {
		const totalCards = Number.isInteger(session?.total_cards)
			? session.total_cards
			: 0;
		const value =
			totalCards > 0 && currentIndex >= 0
				? Math.min(currentIndex + 1, totalCards)
				: 0;

		return {
			max: Math.max(totalCards, 1),
			value,
		};
	}

	function getNextReviewMutation(state, todayKey = getTodayKey()) {
		const currentCard = getCurrentCard(state, todayKey);
		if (!currentCard) {
			return null;
		}

		if (!isCardReviewedToday(currentCard, todayKey)) {
			return { reviewed: true };
		}

		if (!canUndoReview(state, currentCard)) {
			return null;
		}

		return {
			reviewed: false,
			restoreLastReviewed: state.reviewUndoDates[currentCard.id],
		};
	}

	function getReviewButtonState(state, todayKey = getTodayKey()) {
		const currentCard = getCurrentCard(state, todayKey);
		if (!currentCard) {
			return {
				label: "Mark as Reviewed",
				title: "No card selected",
				disabled: true,
				reviewed: false,
				undoable: false,
			};
		}

		const reviewed = isCardReviewedToday(currentCard, todayKey);
		const undoable = canUndoReview(state, currentCard);

		if (state.busyAction === "review") {
			return {
				label: "Saving…",
				title:
					reviewed && undoable ? "Unmark reviewed (R)" : "Mark as reviewed (R)",
				disabled: true,
				reviewed,
				undoable,
			};
		}

		if (!reviewed) {
			return {
				label: "Mark as Reviewed",
				title: "Mark as reviewed (R)",
				disabled: false,
				reviewed: false,
				undoable: false,
			};
		}

		if (undoable) {
			return {
				label: "Reviewed today",
				title: "Unmark reviewed (R)",
				disabled: false,
				reviewed: true,
				undoable: true,
			};
		}

		return {
			label: "Reviewed today",
			title: "Already reviewed today before this browser session",
			disabled: true,
			reviewed: true,
			undoable: false,
		};
	}

	function normalizeShortcutKey(event) {
		if (!event) {
			return "";
		}

		if (
			event.code === "Space" ||
			event.key === " " ||
			event.key === "Spacebar"
		) {
			return "Space";
		}

		return typeof event.key === "string" ? event.key : "";
	}

	function hasShortcutModifier(event) {
		return Boolean(
			event?.altKey || event?.ctrlKey || event?.metaKey || event?.shiftKey,
		);
	}

	function isTextInputTarget(target) {
		if (!target || typeof target !== "object") {
			return false;
		}

		if (
			typeof target.closest === "function" &&
			target.closest("input, select, textarea, [contenteditable='true']")
		) {
			return true;
		}

		const tagName =
			typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";

		return (
			target.isContentEditable === true ||
			tagName === "INPUT" ||
			tagName === "SELECT" ||
			tagName === "TEXTAREA"
		);
	}

	function isKeyboardTriggerTarget(target) {
		if (!target || typeof target !== "object") {
			return false;
		}

		if (typeof target.closest === "function" && target.closest("button, a")) {
			return true;
		}

		const tagName =
			typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";

		return tagName === "BUTTON" || tagName === "A";
	}

	function resolveKeyboardShortcut(event, state) {
		const currentCard = getCurrentCard(state);
		if (
			!currentCard ||
			state?.isOverviewVisible ||
			hasShortcutModifier(event)
		) {
			return null;
		}

		const key = normalizeShortcutKey(event);

		if (isTextInputTarget(event?.target)) {
			return null;
		}

		if (
			(key === "Enter" || key === "Space") &&
			isKeyboardTriggerTarget(event?.target)
		) {
			return null;
		}

		if (key === "ArrowLeft") {
			return state.busyAction === null && getCurrentVisibleIndex(state) > 0
				? { type: "previous" }
				: null;
		}

		if (key === "ArrowRight") {
			return state.busyAction === null &&
				getCurrentVisibleIndex(state) < getVisibleCards(state).length - 1
				? { type: "next" }
				: null;
		}

		if (DIFFICULTY_VALUES.includes(Number(key))) {
			return state.busyAction === null
				? {
						type: "difficulty",
						value: Number(key),
					}
				: null;
		}

		if (typeof key === "string" && key.toLowerCase() === "r") {
			return state.busyAction === null && getNextReviewMutation(state)
				? { type: "reviewToggle" }
				: null;
		}

		if (key !== "Enter" && key !== "Space") {
			return null;
		}

		return { type: "toggleReveal" };
	}

	function removeObjectKey(input, key) {
		const next = { ...input };
		delete next[key];
		return next;
	}

	function moveIndex(currentIndex, delta, totalCards) {
		if (!Number.isInteger(totalCards) || totalCards <= 0) {
			return -1;
		}

		const nextIndex =
			(Number.isInteger(currentIndex) ? currentIndex : 0) + delta;
		return Math.min(totalCards - 1, Math.max(0, nextIndex));
	}

	function replaceCard(cards, nextCard) {
		let replaced = false;
		const nextCards = (Array.isArray(cards) ? cards : []).map((card) => {
			if (card.id === nextCard.id) {
				replaced = true;
				return nextCard;
			}

			return card;
		});

		return replaced ? nextCards : nextCards.concat(nextCard);
	}

	function applyCardUpdate(
		state,
		payload,
		{ nowMs = Date.now(), todayKey = getTodayKey() } = {},
	) {
		const allCards = replaceCard(state.allCards, normalizeCard(payload.card));
		return finalizeSelectionState(
			{
				...state,
				allCards,
				busyAction: null,
				errorMessage: "",
			},
			{
				previousCardId: state.currentCardId,
				nowMs,
				todayKey,
			},
		);
	}

	function applyViewSettings(
		state,
		updates,
		{ nowMs = Date.now(), todayKey = getTodayKey(), statusMessage } = {},
	) {
		const nextSettings = normalizeViewSettings({
			order: updates?.order ?? state.viewSettings.order,
			showReviewedToday: Object.prototype.hasOwnProperty.call(
				updates ?? {},
				"showReviewedToday",
			)
				? updates.showReviewedToday
				: state.viewSettings.showReviewedToday,
			visibleDifficulties: Object.prototype.hasOwnProperty.call(
				updates ?? {},
				"visibleDifficulties",
			)
				? updates.visibleDifficulties
				: state.viewSettings.visibleDifficulties,
		});

		const nextState = finalizeSelectionState(
			{
				...state,
				viewSettings: nextSettings,
				errorMessage: "",
			},
			{
				previousCardId: state.currentCardId,
				nowMs,
				todayKey,
			},
		);

		return {
			...nextState,
			statusMessage:
				statusMessage ??
				(nextState.currentCardId
					? `Live settings updated. ${getVisibleCards(nextState, todayKey).length} cards are visible.`
					: "No cards match the current live settings."),
		};
	}

	function formatDifficultyFilterStatus(values) {
		const normalized = normalizeVisibleDifficulties(values);

		if (normalized.length === 0) {
			return "No difficulty levels are selected.";
		}

		return `Visible difficulties: ${normalized
			.map((value) => formatDifficultyOptionLabel(value))
			.join(", ")}.`;
	}

	function formatOrderStatus(order) {
		return order === "file"
			? "Using file order."
			: "Using one stable shuffled order.";
	}

	function formatReviewedVisibilityStatus(showReviewedToday) {
		return showReviewedToday === false
			? "Reviewed-today cards now hide immediately."
			: "Reviewed-today cards stay visible.";
	}

	function formatViewAdjustedMessage(baseMessage, previousCardId, nextState) {
		if (nextState.currentCardId === previousCardId) {
			return baseMessage;
		}

		const visibleCards = getVisibleCards(nextState);

		if (visibleCards.length === 0) {
			return `${baseMessage} No cards match the current live settings now.`;
		}

		return `${baseMessage} The view moved to the next matching card.`;
	}

	function formatDifficultySavedStatus(
		previousCardId,
		nextState,
		nextDifficulty,
	) {
		return formatViewAdjustedMessage(
			`Difficulty saved as ${formatDifficultyOptionLabel(nextDifficulty)}.`,
			previousCardId,
			nextState,
		);
	}

	function formatReviewSavedStatus(previousCardId, nextState, reviewed) {
		return formatViewAdjustedMessage(
			reviewed
				? "Marked as reviewed today."
				: "Removed the review mark for today.",
			previousCardId,
			nextState,
		);
	}

	function renderMarkdown(markdown, deps) {
		if (!deps?.marked || typeof deps.marked.parse !== "function") {
			throw new Error("marked.js is unavailable.");
		}

		if (!deps?.DOMPurify || typeof deps.DOMPurify.sanitize !== "function") {
			throw new Error("DOMPurify is unavailable.");
		}

		const renderedHtml = deps.marked.parse(markdown ?? "");
		return deps.DOMPurify.sanitize(renderedHtml);
	}

	function renderMathInContainer(container, deps) {
		if (
			!container ||
			!deps?.renderMathInElement ||
			typeof deps.renderMathInElement !== "function"
		) {
			return;
		}

		deps.renderMathInElement(container, {
			delimiters: KATEX_DELIMITERS,
			throwOnError: false,
			strict: "ignore",
		});
	}

	let mermaidRenderCount = 0;

	async function renderMermaidBlocks(container, deps, isStale = () => false) {
		if (
			!container ||
			!deps?.document ||
			!deps?.mermaid ||
			typeof deps.mermaid.render !== "function" ||
			typeof container.querySelectorAll !== "function"
		) {
			return;
		}

		const mermaidBlocks = Array.from(
			container.querySelectorAll("pre > code.language-mermaid"),
		);

		for (const codeBlock of mermaidBlocks) {
			if (isStale()) {
				return;
			}

			const pre = codeBlock.parentElement;

			if (!pre) {
				continue;
			}

			const definition = codeBlock.textContent ?? "";

			try {
				const { svg } = await deps.mermaid.render(
					`mermaid-${++mermaidRenderCount}`,
					definition,
				);

				if (isStale()) {
					return;
				}

				const host = deps.document.createElement("div");
				host.className = "mermaid-host";
				host.innerHTML = deps.DOMPurify.sanitize(svg, {
					USE_PROFILES: { svg: true, svgFilters: true },
				});
				pre.replaceWith(host);
			} catch (error) {
				const note = deps.document.createElement("p");
				note.className = "render-note";
				note.textContent =
					"Mermaid could not be rendered for this card, so the source is shown instead.";
				pre.before(note);
			}
		}
	}

	async function enhanceRenderedContent(
		containers,
		deps,
		isStale = () => false,
	) {
		for (const container of containers) {
			if (!container || isStale()) {
				return;
			}

			renderMathInContainer(container, deps);

			if (isStale()) {
				return;
			}

			await renderMermaidBlocks(container, deps, isStale);
		}
	}

	function collectElements(document) {
		return {
			answerDivider: document.getElementById("answer-divider"),
			backContent: document.getElementById("back-content"),
			backPanel: document.getElementById("back-panel"),
			currentCardTimerText: document.getElementById("current-card-timer-text"),
			currentReviewedText: document.getElementById("current-reviewed-text"),
			currentCardText: document.getElementById("current-card-text"),
			deckCount: document.getElementById("deck-count"),
			difficultyFilterInputs: Array.from(
				document.querySelectorAll("[data-difficulty-filter]"),
			),
			difficultySelect: document.getElementById("difficulty-select"),
			emptyState: document.getElementById("empty-state"),
			errorMessage: document.getElementById("error-message"),
			frontContent: document.getElementById("front-content"),
			frontPanel: document.getElementById("front-panel"),
			nextButton: document.getElementById("next-button"),
			orderFileButton: document.getElementById("order-file-button"),
			orderShuffleButton: document.getElementById("order-shuffle-button"),
			overviewPanel: document.getElementById("overview-panel"),
			overviewToggleButton: document.getElementById("overview-toggle-button"),
			previousButton: document.getElementById("previous-button"),
			revealButton: document.getElementById("reveal-button"),
			reviewButton: document.getElementById("review-button"),
			reviewedHideButton: document.getElementById("reviewed-hide-button"),
			reviewedShowButton: document.getElementById("reviewed-show-button"),
			reviewedToday: document.getElementById("reviewed-today"),
			sessionTimerText: document.getElementById("session-timer-text"),
			sessionProgress: document.getElementById("session-progress"),
			sessionShellBody: document.getElementById("session-shell-body"),
			sessionToggleButton: document.getElementById("session-toggle-button"),
			skippedCount: document.getElementById("skipped-count"),
			startStudyButton: document.getElementById("start-study-button"),
			statusMessage: document.getElementById("status-message"),
			studyLayout: document.getElementById("study-layout"),
			visibleCount: document.getElementById("visible-count"),
		};
	}

	function renderApp(elements, state, deps) {
		const sessionSummary = getVisibleSessionSummary(state);
		const currentCard = getCurrentCard(state);
		const currentIndex = getCurrentVisibleIndex(state);
		const hasCards = Boolean(currentCard);
		const currentCardSummary = getCurrentCardSummary(state);
		const progress = getSessionProgress(sessionSummary, currentIndex);
		const reviewButtonState = getReviewButtonState(state);
		const isDifficultyDisabled = !hasCards || state.busyAction !== null;

		elements.currentCardText.textContent = currentCardSummary.position;
		elements.currentReviewedText.textContent = currentCardSummary.reviewed;
		elements.currentCardTimerText.textContent = currentCardSummary.cardTimer;
		elements.sessionTimerText.textContent = currentCardSummary.sessionTimer;
		elements.visibleCount.textContent = String(sessionSummary.total_cards);
		elements.deckCount.textContent = String(sessionSummary.deck_cards);
		elements.reviewedToday.textContent = String(sessionSummary.reviewed_today);
		elements.skippedCount.textContent = String(sessionSummary.skipped_cards);
		elements.sessionProgress.max = progress.max;
		elements.sessionProgress.value = progress.value;
		elements.sessionProgress.setAttribute(
			"aria-valuetext",
			formatProgressText(sessionSummary, currentIndex),
		);
		elements.sessionProgress.classList.toggle("is-empty", !hasCards);
		elements.statusMessage.textContent = state.statusMessage;
		elements.errorMessage.textContent = state.errorMessage;
		elements.errorMessage.classList.toggle(
			"is-hidden",
			state.errorMessage === "",
		);
		elements.overviewPanel.classList.toggle(
			"is-hidden",
			!state.isOverviewVisible,
		);
		elements.studyLayout.classList.toggle("is-hidden", state.isOverviewVisible);
		elements.sessionShellBody.classList.toggle(
			"is-hidden",
			!state.isSessionBoxExpanded,
		);
		elements.overviewToggleButton.textContent = formatGuideToggleLabel(
			state.isOverviewVisible,
		);
		elements.overviewToggleButton.setAttribute(
			"aria-pressed",
			String(state.isOverviewVisible),
		);
		elements.sessionToggleButton.textContent = formatSessionToggleLabel(
			state.isSessionBoxExpanded,
		);
		elements.sessionToggleButton.setAttribute(
			"aria-pressed",
			String(state.isSessionBoxExpanded),
		);
		elements.overviewToggleButton.disabled = state.busyAction !== null;
		elements.startStudyButton.disabled = state.busyAction !== null;
		elements.sessionToggleButton.disabled = state.busyAction !== null;
		elements.orderFileButton.disabled = state.busyAction !== null;
		elements.orderShuffleButton.disabled = state.busyAction !== null;
		elements.reviewedShowButton.disabled = state.busyAction !== null;
		elements.reviewedHideButton.disabled = state.busyAction !== null;
		elements.orderFileButton.setAttribute(
			"aria-pressed",
			String(state.viewSettings.order === "file"),
		);
		elements.orderShuffleButton.setAttribute(
			"aria-pressed",
			String(state.viewSettings.order === "shuffle"),
		);
		elements.reviewedShowButton.setAttribute(
			"aria-pressed",
			String(state.viewSettings.showReviewedToday !== false),
		);
		elements.reviewedHideButton.setAttribute(
			"aria-pressed",
			String(state.viewSettings.showReviewedToday === false),
		);

		for (const input of elements.difficultyFilterInputs) {
			input.checked = state.viewSettings.visibleDifficulties.includes(
				Number(input.value),
			);
			input.disabled = state.busyAction !== null;
		}

		elements.emptyState.classList.toggle("is-hidden", hasCards);
		elements.frontPanel.hidden = !hasCards;
		elements.backPanel.hidden = !hasCards || !state.isBackVisible;
		elements.answerDivider.hidden = !hasCards || !state.isBackVisible;

		elements.previousButton.disabled =
			!hasCards || state.busyAction !== null || currentIndex <= 0;
		elements.nextButton.disabled =
			!hasCards ||
			state.busyAction !== null ||
			currentIndex >= sessionSummary.total_cards - 1;
		elements.revealButton.disabled = !hasCards;
		elements.revealButton.setAttribute(
			"aria-pressed",
			String(state.isBackVisible),
		);
		elements.revealButton.classList.toggle("is-revealed", state.isBackVisible);
		elements.reviewButton.disabled = reviewButtonState.disabled;
		elements.revealButton.textContent = state.isBackVisible
			? "Hide answer"
			: "Reveal answer";
		elements.revealButton.title = state.isBackVisible
			? "Hide answer (Space or Enter)"
			: "Reveal answer (Space or Enter)";
		elements.reviewButton.textContent = reviewButtonState.label;
		elements.reviewButton.title = reviewButtonState.title;
		elements.reviewButton.setAttribute(
			"aria-pressed",
			String(reviewButtonState.reviewed),
		);
		elements.reviewButton.classList.toggle(
			"is-reviewed",
			reviewButtonState.reviewed,
		);
		elements.reviewButton.classList.toggle(
			"is-review-locked",
			reviewButtonState.reviewed && !reviewButtonState.undoable,
		);
		elements.difficultySelect.disabled = isDifficultyDisabled;

		if (hasCards) {
			elements.revealButton.setAttribute("aria-keyshortcuts", "Enter Space");
		} else {
			elements.revealButton.removeAttribute("aria-keyshortcuts");
		}

		if (hasCards && !reviewButtonState.disabled) {
			elements.reviewButton.setAttribute("aria-keyshortcuts", "R");
		} else {
			elements.reviewButton.removeAttribute("aria-keyshortcuts");
		}

		elements.difficultySelect.innerHTML = buildDifficultyOptions(
			hasCards ? currentCard.difficulty : DEFAULT_DIFFICULTY,
		)
			.map((option) => {
				return `<option value="${option.value}"${option.selected ? " selected" : ""}>${option.label}</option>`;
			})
			.join("");

		if (!hasCards) {
			elements.frontContent.innerHTML = "";
			elements.backContent.innerHTML = "";
			return;
		}

		elements.frontContent.innerHTML = renderMarkdown(currentCard.front, deps);
		elements.backContent.innerHTML = renderMarkdown(currentCard.back, deps);
	}

	async function requestJson(fetchImpl, url, options) {
		const response = await fetchImpl(url, options);
		const responseText = await response.text();
		const payload = responseText ? JSON.parse(responseText) : null;

		if (!response.ok) {
			const error = new Error(
				payload && typeof payload.error === "string"
					? payload.error
					: `Request failed with status ${response.status}.`,
			);
			error.status = response.status;
			error.payload = payload;
			throw error;
		}

		return payload;
	}

	function ensureRuntimeDependencies(deps) {
		if (!deps.document) {
			throw new Error("document is unavailable.");
		}

		if (typeof deps.fetch !== "function") {
			throw new Error("fetch is unavailable.");
		}

		if (!deps.marked || typeof deps.marked.parse !== "function") {
			throw new Error("marked.js failed to load from the CDN.");
		}

		if (!deps.DOMPurify || typeof deps.DOMPurify.sanitize !== "function") {
			throw new Error("DOMPurify failed to load from the CDN.");
		}
	}

	async function bootstrapFrontend(browserGlobal) {
		const deps = {
			document: browserGlobal.document,
			fetch: browserGlobal.fetch.bind(browserGlobal),
			marked: browserGlobal.marked,
			DOMPurify: browserGlobal.DOMPurify,
			mermaid: browserGlobal.mermaid,
			renderMathInElement: browserGlobal.renderMathInElement,
			random: Math.random,
		};
		const elements = collectElements(browserGlobal.document);
		let state = createInitialState();
		let renderCycle = 0;

		const rerender = () => {
			renderApp(elements, state, deps);

			const cycle = ++renderCycle;
			const isStale = () => cycle !== renderCycle;

			void enhanceRenderedContent(
				[elements.frontContent, elements.backContent],
				deps,
				isStale,
			).catch((error) => {
				if (!isStale()) {
					console.error("Card enhancement failed.", error);
				}
			});
		};

		function setState(nextState) {
			state = nextState;
			rerender();
		}

		const refreshCurrentCardSummary = () => {
			const summary = getCurrentCardSummary(state);
			elements.currentCardText.textContent = summary.position;
			elements.currentReviewedText.textContent = summary.reviewed;
			elements.currentCardTimerText.textContent = summary.cardTimer;
			elements.sessionTimerText.textContent = summary.sessionTimer;
		};

		browserGlobal.setInterval(refreshCurrentCardSummary, 1000);

		if (deps.mermaid && typeof deps.mermaid.initialize === "function") {
			deps.mermaid.initialize(MERMAID_CONFIG);
		}

		elements.startStudyButton.addEventListener("click", () => {
			setState(
				ensureStudyTimersStarted(
					setSessionBoxExpanded(setOverviewVisibility(state, false), false),
				),
			);
		});

		elements.overviewToggleButton.addEventListener("click", () => {
			const nextOverviewVisibility = !state.isOverviewVisible;
			const nextState = setSessionBoxExpanded(
				setOverviewVisibility(state, nextOverviewVisibility),
				false,
			);

			setState(
				nextOverviewVisibility
					? nextState
					: ensureStudyTimersStarted(nextState),
			);
		});

		elements.sessionToggleButton.addEventListener("click", () => {
			setState(setSessionBoxExpanded(state, !state.isSessionBoxExpanded));
		});

		elements.orderFileButton.addEventListener("click", () => {
			if (state.busyAction !== null || state.viewSettings.order === "file") {
				return;
			}

			setState(
				applyViewSettings(
					state,
					{ order: "file" },
					{
						nowMs: Date.now(),
						statusMessage: formatOrderStatus("file"),
					},
				),
			);
		});

		elements.orderShuffleButton.addEventListener("click", () => {
			if (state.busyAction !== null || state.viewSettings.order === "shuffle") {
				return;
			}

			setState(
				applyViewSettings(
					state,
					{ order: "shuffle" },
					{
						nowMs: Date.now(),
						statusMessage: formatOrderStatus("shuffle"),
					},
				),
			);
		});

		elements.reviewedShowButton.addEventListener("click", () => {
			if (state.busyAction !== null || state.viewSettings.showReviewedToday) {
				return;
			}

			setState(
				applyViewSettings(
					state,
					{ showReviewedToday: true },
					{
						nowMs: Date.now(),
						statusMessage: formatReviewedVisibilityStatus(true),
					},
				),
			);
		});

		elements.reviewedHideButton.addEventListener("click", () => {
			if (
				state.busyAction !== null ||
				state.viewSettings.showReviewedToday === false
			) {
				return;
			}

			setState(
				applyViewSettings(
					state,
					{ showReviewedToday: false },
					{
						nowMs: Date.now(),
						statusMessage: formatReviewedVisibilityStatus(false),
					},
				),
			);
		});

		for (const input of elements.difficultyFilterInputs) {
			input.addEventListener("change", (event) => {
				if (state.busyAction !== null) {
					rerender();
					return;
				}

				const value = Number(event.target.value);
				const nextVisibleDifficulties =
					state.viewSettings.visibleDifficulties.includes(value)
						? state.viewSettings.visibleDifficulties.filter(
								(item) => item !== value,
							)
						: state.viewSettings.visibleDifficulties.concat(value);

				setState(
					applyViewSettings(
						state,
						{ visibleDifficulties: nextVisibleDifficulties },
						{
							nowMs: Date.now(),
							statusMessage: formatDifficultyFilterStatus(
								nextVisibleDifficulties,
							),
						},
					),
				);
			});
		}

		function selectRelativeCard(delta) {
			const visibleCards = getVisibleCards(state);
			const currentIndex = getCurrentVisibleIndex(state);
			const nextIndex = moveIndex(currentIndex, delta, visibleCards.length);
			const nextCardId = nextIndex >= 0 ? visibleCards[nextIndex].id : null;

			setState({
				...state,
				currentCardId: nextCardId,
				cardStartedAt:
					nextCardId && Number.isFinite(state.sessionStartedAt)
						? Date.now()
						: null,
				isBackVisible: false,
				errorMessage: "",
				statusMessage:
					nextIndex >= 0
						? `Viewing card ${nextIndex + 1} of ${visibleCards.length}.`
						: "No cards are available in this live view.",
			});
		}

		function toggleBackVisibility() {
			if (!getCurrentCard(state)) {
				return;
			}

			setState({
				...state,
				isBackVisible: !state.isBackVisible,
				errorMessage: "",
				statusMessage: !state.isBackVisible
					? "Back revealed."
					: "Back hidden. Front content remains visible.",
			});
		}

		async function saveDifficulty(nextDifficulty) {
			const currentCard = getCurrentCard(state);
			if (
				!currentCard ||
				state.busyAction !== null ||
				currentCard.difficulty === nextDifficulty
			) {
				return;
			}

			setState({
				...state,
				busyAction: "difficulty",
				errorMessage: "",
				statusMessage: `Saving difficulty ${formatDifficultyOptionLabel(nextDifficulty)}…`,
			});

			try {
				const payload = await requestJson(
					deps.fetch,
					API_ROUTES.difficulty(currentCard.id),
					{
						method: "PATCH",
						headers: {
							"content-type": "application/json",
						},
						body: JSON.stringify({ difficulty: nextDifficulty }),
					},
				);

				const nextState = applyCardUpdate(state, payload, {
					nowMs: Date.now(),
				});

				setState({
					...nextState,
					statusMessage: formatDifficultySavedStatus(
						currentCard.id,
						nextState,
						nextDifficulty,
					),
				});
			} catch (error) {
				setState({
					...state,
					busyAction: null,
					errorMessage: error.message,
					statusMessage: "Difficulty change failed.",
				});
			}
		}

		async function toggleReviewedCurrentCard() {
			const currentCard = getCurrentCard(state);
			const reviewMutation = getNextReviewMutation(state);

			if (!currentCard || !reviewMutation || state.busyAction !== null) {
				return;
			}

			setState({
				...state,
				busyAction: "review",
				errorMessage: "",
				statusMessage: reviewMutation.reviewed
					? "Marking this card as reviewed…"
					: "Removing this review mark…",
			});

			try {
				const payload = await requestJson(
					deps.fetch,
					API_ROUTES.review(currentCard.id),
					{
						method: "PATCH",
						headers: {
							"content-type": "application/json",
						},
						body: JSON.stringify(
							reviewMutation.reviewed
								? { reviewed: true }
								: {
										reviewed: false,
										restore_last_reviewed: reviewMutation.restoreLastReviewed,
									},
						),
					},
				);

				const nextState = applyCardUpdate(state, payload, {
					nowMs: Date.now(),
				});

				setState({
					...nextState,
					reviewUndoDates: reviewMutation.reviewed
						? {
								...state.reviewUndoDates,
								[currentCard.id]: currentCard.last_reviewed,
							}
						: removeObjectKey(state.reviewUndoDates, currentCard.id),
					statusMessage: formatReviewSavedStatus(
						currentCard.id,
						nextState,
						reviewMutation.reviewed,
					),
				});
			} catch (error) {
				setState({
					...state,
					busyAction: null,
					errorMessage: error.message,
					statusMessage: "Review update failed.",
				});
			}
		}

		elements.previousButton.addEventListener("click", () => {
			if (state.busyAction !== null) {
				return;
			}

			selectRelativeCard(-1);
		});

		elements.nextButton.addEventListener("click", () => {
			if (state.busyAction !== null) {
				return;
			}

			selectRelativeCard(1);
		});

		elements.revealButton.addEventListener("click", () => {
			toggleBackVisibility();
		});

		elements.difficultySelect.addEventListener("change", (event) => {
			void saveDifficulty(Number(event.target.value));
		});

		elements.reviewButton.addEventListener("click", () => {
			void toggleReviewedCurrentCard();
		});

		deps.document.addEventListener("keydown", (event) => {
			const action = resolveKeyboardShortcut(event, state);

			if (!action) {
				return;
			}

			event.preventDefault();

			if (action.type === "previous") {
				selectRelativeCard(-1);
				return;
			}

			if (action.type === "next") {
				selectRelativeCard(1);
				return;
			}

			if (action.type === "difficulty") {
				void saveDifficulty(action.value);
				return;
			}

			if (action.type === "reviewToggle") {
				void toggleReviewedCurrentCard();
				return;
			}

			toggleBackVisibility();
		});

		rerender();

		try {
			ensureRuntimeDependencies(deps);
			const payload = await requestJson(deps.fetch, API_ROUTES.session);
			setState({
				...createInitialState(payload, { random: deps.random }),
				statusMessage:
					Array.isArray(payload?.cards) && payload.cards.length > 0
						? "Review the guide and start when ready."
						: "No cards were loaded from cards.md.",
			});
		} catch (error) {
			setState({
				...state,
				busyAction: null,
				errorMessage: error.message,
				statusMessage: "The study interface could not finish loading.",
			});
		}
	}

	const exported = {
		APP_INFO,
		API_ROUTES,
		DEFAULT_DIFFICULTY,
		DEFAULT_VIEW_SETTINGS,
		DIFFICULTY_VALUES,
		KATEX_DELIMITERS,
		MERMAID_CONFIG,
		STUDY_DIFFICULTY_VALUES,
		UI_LABELS,
		applyCardUpdate,
		applyViewSettings,
		buildDifficultyOptions,
		canUndoReview,
		countReviewedToday,
		countSkippedCards,
		createInitialState,
		createShuffledCardIds,
		finalizeSelectionState,
		formatCurrentCardLabel,
		formatDifficultyFilterStatus,
		formatDifficultyLabel,
		formatDifficultyOptionLabel,
		formatElapsedTimer,
		formatFilterLabel,
		formatGuideToggleLabel,
		formatLastReviewedValue,
		formatOrderStatus,
		formatProgressText,
		formatReviewedFilterLabel,
		formatReviewedVisibilityStatus,
		formatSessionFilterSummary,
		formatSessionToggleLabel,
		formatStackMode,
		formatTimerText,
		getCurrentCardSummary,
		getCurrentCard,
		getCurrentVisibleIndex,
		getNextReviewMutation,
		getOrderedCardIds,
		getOrderedCards,
		getReviewButtonState,
		getSessionProgress,
		getTodayKey,
		getVisibleCardIds,
		getVisibleCards,
		getVisibleSessionSummary,
		hasShortcutModifier,
		isCardReviewedToday,
		isKeyboardTriggerTarget,
		isTextInputTarget,
		matchesViewSettings,
		moveIndex,
		normalizeCard,
		normalizeCards,
		normalizeDifficultyValue,
		normalizeSession,
		normalizeShortcutKey,
		normalizeViewSettings,
		normalizeVisibleDifficulties,
		enhanceRenderedContent,
		renderMarkdown,
		renderMathInContainer,
		renderMermaidBlocks,
		replaceCard,
		reconcileCurrentCardId,
		resolveKeyboardShortcut,
		setSessionBoxExpanded,
		setOverviewVisibility,
	};

	if (typeof module !== "undefined" && module.exports) {
		module.exports = exported;
	}

	if (
		globalScope &&
		globalScope.document &&
		typeof globalScope.fetch === "function"
	) {
		void bootstrapFrontend(globalScope);
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
