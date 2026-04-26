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
			show: "Show session info",
			hide: "Hide session info",
		}),
	});

	const DIFFICULTY_VALUES = Object.freeze([1, 2, 3, 4, 5]);
	const DEFAULT_DIFFICULTY = 3;

	const API_ROUTES = {
		session: "/api/session",
		difficulty(cardId) {
			return `/api/cards/${encodeURIComponent(cardId)}/difficulty`;
		},
		review(cardId) {
			return `/api/cards/${encodeURIComponent(cardId)}/review`;
		},
	};

	function formatStackMode(shuffle) {
		return shuffle === "yes" ? "Shuffled session" : "File order";
	}

	function normalizeSession(session, fallbackTotal = 0) {
		return {
			card_ids: Array.isArray(session?.card_ids)
				? session.card_ids.slice()
				: [],
			filter_difficulty: Array.isArray(session?.filter_difficulty)
				? session.filter_difficulty.slice()
				: null,
			shuffle: session?.shuffle === "yes" ? "yes" : "no",
			total_cards: Number.isInteger(session?.total_cards)
				? session.total_cards
				: fallbackTotal,
			reviewed_today: Number.isInteger(session?.reviewed_today)
				? session.reviewed_today
				: 0,
		};
	}

	function createInitialState(payload = {}) {
		const cards = Array.isArray(payload.cards) ? payload.cards.slice() : [];

		return {
			cards,
			session: normalizeSession(payload.session, cards.length),
			reviewUndoDates: {},
			currentIndex: cards.length > 0 ? 0 : -1,
			isBackVisible: false,
			isOverviewVisible: true,
			isSessionBoxExpanded: false,
			busyAction: null,
			errorMessage: "",
			statusMessage: "Loading session…",
		};
	}

	function setOverviewVisibility(state, isOverviewVisible) {
		const hasCards = Array.isArray(state?.cards) && state.cards.length > 0;

		return {
			...state,
			isOverviewVisible,
			statusMessage: isOverviewVisible
				? "Guide open. Your current card is preserved."
				: hasCards
					? "Study mode ready. Front content is shown by default."
					: "Study mode open. No eligible cards match the current session filter.",
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

	function getCurrentCard(state) {
		if (
			!state ||
			state.currentIndex < 0 ||
			state.currentIndex >= state.cards.length
		) {
			return null;
		}

		return state.cards[state.currentIndex];
	}

	function formatCurrentCardLabel(
		session,
		currentIndex,
		fallbackLabel = "No cards in session",
	) {
		const totalCards = Number.isInteger(session?.total_cards)
			? session.total_cards
			: 0;

		if (totalCards <= 0 || currentIndex < 0) {
			return fallbackLabel;
		}

		return `Card ${Math.min(currentIndex + 1, totalCards)} of ${totalCards}`;
	}

	function getTodayKey(date = new Date()) {
		return date.toISOString().slice(0, 10);
	}

	function isCardReviewedToday(card, todayKey = getTodayKey()) {
		return Boolean(card && card.last_reviewed === todayKey);
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
		if (!Array.isArray(filterDifficulty) || filterDifficulty.length === 0) {
			return "All difficulties";
		}

		return filterDifficulty.join(", ");
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
				label: String(value),
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
		const currentCard = getCurrentCard(state);
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
		const currentCard = getCurrentCard(state);
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
					reviewed && undoable
						? "Unmark reviewed (R)"
						: "Mark as reviewed (R)",
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
			title: "Already reviewed today before this session",
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
			return state.busyAction === null && state.currentIndex > 0
				? { type: "previous" }
				: null;
		}

		if (key === "ArrowRight") {
			return state.busyAction === null &&
				state.currentIndex < state.cards.length - 1
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
		return cards.map((card) => (card.id === nextCard.id ? nextCard : card));
	}

	function applyCardUpdate(state, payload) {
		const cards = replaceCard(state.cards, payload.card);
		return {
			...state,
			cards,
			session: normalizeSession(payload.session, cards.length),
			busyAction: null,
			errorMessage: "",
		};
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

	function collectElements(document) {
		return {
			answerDivider: document.getElementById("answer-divider"),
			backContent: document.getElementById("back-content"),
			backPanel: document.getElementById("back-panel"),
			currentCardText: document.getElementById("current-card-text"),
			difficultyFilter: document.getElementById("difficulty-filter"),
			difficultySelect: document.getElementById("difficulty-select"),
			eligibleCount: document.getElementById("eligible-count"),
			emptyState: document.getElementById("empty-state"),
			errorMessage: document.getElementById("error-message"),
			frontContent: document.getElementById("front-content"),
			frontPanel: document.getElementById("front-panel"),
			nextButton: document.getElementById("next-button"),
			overviewDifficultyFilter: document.getElementById(
				"overview-difficulty-filter",
			),
			overviewEligibleCount: document.getElementById("overview-eligible-count"),
			overviewPanel: document.getElementById("overview-panel"),
			overviewReviewedToday: document.getElementById("overview-reviewed-today"),
			overviewSourceFile: document.getElementById("overview-source-file"),
			overviewStackMode: document.getElementById("overview-stack-mode"),
			overviewToggleButton: document.getElementById("overview-toggle-button"),
			previousButton: document.getElementById("previous-button"),
			revealButton: document.getElementById("reveal-button"),
			reviewButton: document.getElementById("review-button"),
			reviewedToday: document.getElementById("reviewed-today"),
			sessionProgress: document.getElementById("session-progress"),
			sessionShellBody: document.getElementById("session-shell-body"),
			sessionSourceFile: document.getElementById("session-source-file"),
			sessionToggleButton: document.getElementById("session-toggle-button"),
			startStudyButton: document.getElementById("start-study-button"),
			stackMode: document.getElementById("stack-mode"),
			statusMessage: document.getElementById("status-message"),
			studyLayout: document.getElementById("study-layout"),
		};
	}

	function renderApp(elements, state, deps) {
		const currentCard = getCurrentCard(state);
		const hasCards = Boolean(currentCard);
		const stackModeLabel = formatStackMode(state.session.shuffle);
		const filterLabel = formatFilterLabel(state.session.filter_difficulty);
		const progress = getSessionProgress(state.session, state.currentIndex);
		const isDifficultyDisabled = !hasCards || state.busyAction !== null;
		const reviewButtonState = getReviewButtonState(state);
		const currentCardLabel = formatCurrentCardLabel(
			state.session,
			state.currentIndex,
			state.statusMessage === "Loading session…"
				? "Loading session…"
				: "No cards in session",
		);

		elements.currentCardText.textContent = currentCardLabel;
		elements.sessionProgress.max = progress.max;
		elements.sessionProgress.value = progress.value;
		elements.sessionProgress.setAttribute(
			"aria-valuetext",
			formatProgressText(state.session, state.currentIndex),
		);
		elements.sessionProgress.classList.toggle("is-empty", !hasCards);
		elements.statusMessage.textContent = state.statusMessage;
		elements.errorMessage.textContent = state.errorMessage;
		elements.errorMessage.classList.toggle(
			"is-hidden",
			state.errorMessage === "",
		);
		elements.overviewSourceFile.textContent = APP_INFO.sourceFileLabel;
		elements.overviewDifficultyFilter.textContent = filterLabel;
		elements.overviewStackMode.textContent = stackModeLabel;
		elements.overviewEligibleCount.textContent = String(
			state.session.total_cards,
		);
		elements.overviewReviewedToday.textContent = String(
			state.session.reviewed_today,
		);
		elements.sessionSourceFile.textContent = APP_INFO.sourceFileLabel;
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
		elements.overviewToggleButton.disabled = state.busyAction !== null;
		elements.startStudyButton.disabled = state.busyAction !== null;
		elements.sessionToggleButton.disabled = state.busyAction !== null;
		elements.sessionToggleButton.textContent = formatSessionToggleLabel(
			state.isSessionBoxExpanded,
		);
		elements.sessionToggleButton.setAttribute(
			"aria-pressed",
			String(state.isSessionBoxExpanded),
		);

		elements.stackMode.textContent = stackModeLabel;
		elements.eligibleCount.textContent = String(state.session.total_cards);
		elements.difficultyFilter.textContent = filterLabel;
		elements.reviewedToday.textContent = String(state.session.reviewed_today);

		elements.emptyState.classList.toggle("is-hidden", hasCards);
		elements.frontPanel.hidden = !hasCards;
		elements.backPanel.hidden = !hasCards || !state.isBackVisible;
		elements.answerDivider.hidden = !hasCards || !state.isBackVisible;

		elements.previousButton.disabled =
			!hasCards || state.busyAction !== null || state.currentIndex <= 0;
		elements.nextButton.disabled =
			!hasCards ||
			state.busyAction !== null ||
			state.currentIndex >= state.cards.length - 1;
		elements.revealButton.disabled = !hasCards;
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
			.map(
				(option) =>
					`<option value="${option.value}"${option.selected ? " selected" : ""}>${option.label}</option>`,
			)
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
		};
		const elements = collectElements(browserGlobal.document);
		let state = createInitialState();

		const rerender = () => renderApp(elements, state, deps);

		function setState(nextState) {
			state = nextState;
			rerender();
		}

		elements.startStudyButton.addEventListener("click", () => {
			setState(
				setSessionBoxExpanded(setOverviewVisibility(state, false), false),
			);
		});

		elements.overviewToggleButton.addEventListener("click", () => {
			const nextOverviewVisibility = !state.isOverviewVisible;
			setState(
				setSessionBoxExpanded(
					setOverviewVisibility(state, nextOverviewVisibility),
					false,
				),
			);
		});

		elements.sessionToggleButton.addEventListener("click", () => {
			setState(setSessionBoxExpanded(state, !state.isSessionBoxExpanded));
		});

		function selectIndex(nextIndex) {
			setState({
				...state,
				currentIndex: nextIndex,
				isBackVisible: false,
				errorMessage: "",
				statusMessage:
					nextIndex >= 0
						? `Viewing card ${nextIndex + 1} of ${state.cards.length}.`
						: "No cards are available in this session.",
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
				statusMessage: `Saving difficulty ${nextDifficulty}…`,
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

				setState({
					...applyCardUpdate(state, payload),
					statusMessage: `Difficulty saved as ${nextDifficulty}.`,
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
										restore_last_reviewed:
											reviewMutation.restoreLastReviewed,
								  },
						),
					},
				);

				setState({
					...applyCardUpdate(state, payload),
					reviewUndoDates: reviewMutation.reviewed
						? {
								...state.reviewUndoDates,
								[currentCard.id]: currentCard.last_reviewed,
							}
						: removeObjectKey(state.reviewUndoDates, currentCard.id),
					statusMessage: reviewMutation.reviewed
						? "Marked as reviewed today."
						: "Removed the review mark for today.",
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

			selectIndex(moveIndex(state.currentIndex, -1, state.cards.length));
		});

		elements.nextButton.addEventListener("click", () => {
			if (state.busyAction !== null) {
				return;
			}

			selectIndex(moveIndex(state.currentIndex, 1, state.cards.length));
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
				selectIndex(moveIndex(state.currentIndex, -1, state.cards.length));
				return;
			}

			if (action.type === "next") {
				selectIndex(moveIndex(state.currentIndex, 1, state.cards.length));
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
				...createInitialState(payload),
				statusMessage:
					payload.cards.length > 0
						? "Review the guide and start when ready."
						: "No eligible cards matched the current session filter.",
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
		DIFFICULTY_VALUES,
		UI_LABELS,
		applyCardUpdate,
		buildDifficultyOptions,
		canUndoReview,
		createInitialState,
		formatCurrentCardLabel,
		formatFilterLabel,
		formatGuideToggleLabel,
		formatProgressText,
		formatSessionToggleLabel,
		formatStackMode,
		getCurrentCard,
		getNextReviewMutation,
		getReviewButtonState,
		getSessionProgress,
		getTodayKey,
		hasShortcutModifier,
		isCardReviewedToday,
		isKeyboardTriggerTarget,
		isTextInputTarget,
		moveIndex,
		normalizeSession,
		normalizeShortcutKey,
		renderMarkdown,
		replaceCard,
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
