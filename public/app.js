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

	function formatCardSideLabel(isBackVisible) {
		return isBackVisible ? "Front + Back" : "Front";
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

	function buildDifficultyOptions(selectedDifficulty) {
		return Array.from({ length: 10 }, (_, index) => {
			const value = index + 1;
			return {
				value,
				label: String(value),
				selected: value === Number(selectedDifficulty),
			};
		});
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
			backContent: document.getElementById("back-content"),
			backPanel: document.getElementById("back-panel"),
			cardId: document.getElementById("card-id"),
			cardSideLabel: document.getElementById("card-side-label"),
			difficultyFilter: document.getElementById("difficulty-filter"),
			difficultySelect: document.getElementById("difficulty-select"),
			eligibleCount: document.getElementById("eligible-count"),
			emptyState: document.getElementById("empty-state"),
			errorMessage: document.getElementById("error-message"),
			frontContent: document.getElementById("front-content"),
			frontPanel: document.getElementById("front-panel"),
			lastReviewed: document.getElementById("last-reviewed"),
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
			progressText: document.getElementById("progress-text"),
			revealButton: document.getElementById("reveal-button"),
			reviewButton: document.getElementById("review-button"),
			reviewedToday: document.getElementById("reviewed-today"),
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

		elements.progressText.textContent = formatProgressText(
			state.session,
			state.currentIndex,
		);
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

		elements.previousButton.disabled =
			!hasCards || state.busyAction !== null || state.currentIndex <= 0;
		elements.nextButton.disabled =
			!hasCards ||
			state.busyAction !== null ||
			state.currentIndex >= state.cards.length - 1;
		elements.revealButton.disabled = !hasCards;
		elements.reviewButton.disabled = !hasCards || state.busyAction !== null;
		elements.difficultySelect.disabled = !hasCards || state.busyAction !== null;
		elements.revealButton.textContent = state.isBackVisible
			? "Hide answer"
			: "Reveal answer";
		elements.reviewButton.textContent =
			state.busyAction === "review" ? "Saving…" : "Mark as Reviewed";
		elements.cardSideLabel.textContent = formatCardSideLabel(
			state.isBackVisible,
		);

		if (!hasCards) {
			elements.cardId.textContent = "—";
			elements.lastReviewed.textContent = "—";
			elements.frontContent.innerHTML = "";
			elements.backContent.innerHTML = "";
			elements.difficultySelect.innerHTML = buildDifficultyOptions(5)
				.map(
					(option) =>
						`<option value="${option.value}"${option.selected ? " selected" : ""}>${option.label}</option>`,
				)
				.join("");
			return;
		}

		elements.cardId.textContent = currentCard.id;
		elements.lastReviewed.textContent = currentCard.last_reviewed;
		elements.difficultySelect.innerHTML = buildDifficultyOptions(
			currentCard.difficulty,
		)
			.map(
				(option) =>
					`<option value="${option.value}"${option.selected ? " selected" : ""}>${option.label}</option>`,
			)
			.join("");
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

		elements.previousButton.addEventListener("click", () => {
			selectIndex(moveIndex(state.currentIndex, -1, state.cards.length));
		});

		elements.nextButton.addEventListener("click", () => {
			selectIndex(moveIndex(state.currentIndex, 1, state.cards.length));
		});

		elements.revealButton.addEventListener("click", () => {
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
		});

		elements.difficultySelect.addEventListener("change", async (event) => {
			const currentCard = getCurrentCard(state);
			if (!currentCard) {
				return;
			}

			const nextDifficulty = Number(event.target.value);
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
		});

		elements.reviewButton.addEventListener("click", async () => {
			const currentCard = getCurrentCard(state);
			if (!currentCard) {
				return;
			}

			setState({
				...state,
				busyAction: "review",
				errorMessage: "",
				statusMessage: "Marking this card as reviewed…",
			});

			try {
				const payload = await requestJson(
					deps.fetch,
					API_ROUTES.review(currentCard.id),
					{
						method: "POST",
					},
				);

				setState({
					...applyCardUpdate(state, payload),
					statusMessage: "Marked as reviewed today.",
				});
			} catch (error) {
				setState({
					...state,
					busyAction: null,
					errorMessage: error.message,
					statusMessage: "Review update failed.",
				});
			}
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
		UI_LABELS,
		applyCardUpdate,
		buildDifficultyOptions,
		createInitialState,
		formatCardSideLabel,
		formatFilterLabel,
		formatGuideToggleLabel,
		formatProgressText,
		formatSessionToggleLabel,
		formatStackMode,
		getCurrentCard,
		moveIndex,
		normalizeSession,
		renderMarkdown,
		replaceCard,
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
