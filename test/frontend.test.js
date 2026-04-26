const assert = require("node:assert/strict");
const test = require("node:test");

const {
	APP_INFO,
	DEFAULT_DIFFICULTY,
	DIFFICULTY_VALUES,
	UI_LABELS,
	applyCardUpdate,
	canUndoReview,
	buildDifficultyOptions,
	createInitialState,
	formatCurrentCardLabel,
	formatElapsedTimer,
	formatFilterLabel,
	formatGuideToggleLabel,
	formatLastReviewedValue,
	formatProgressText,
	formatReviewedFilterLabel,
	formatSessionFilterSummary,
	formatSessionToggleLabel,
	formatStackMode,
	getCurrentCardSummary,
	getNextReviewMutation,
	getReviewButtonState,
	getCurrentCard,
	getTodayKey,
	getSessionProgress,
	isCardReviewedToday,
	moveIndex,
	renderMarkdown,
	resolveKeyboardShortcut,
	setSessionBoxExpanded,
	setOverviewVisibility,
} = require("../public/app.js");

test("formatProgressText shows the persistent progress indicator format", () => {
	assert.equal(
		formatProgressText({ total_cards: 7, reviewed_today: 3 }, 1),
		"Card 2 of 7 · 3 reviewed today",
	);
	assert.equal(
		formatProgressText({ total_cards: 0, reviewed_today: 0 }, -1),
		"Card 0 of 0 · 0 reviewed today",
	);
});

test("review summary helpers format readable review-date and timer metadata", () => {
	assert.equal(formatElapsedTimer(null, 62_000), "00:00");
	assert.equal(formatElapsedTimer(1_000, 62_000), "01:01");
	assert.equal(formatElapsedTimer(0, 3_723_000), "1:02:03");
	assert.equal(formatLastReviewedValue("2026-04-26", "2026-04-26"), "Today");
	assert.equal(
		formatLastReviewedValue("2026-04-20", "2026-04-26"),
		"Apr 20, 2026",
	);
	assert.equal(formatLastReviewedValue(), "Not yet");

	const state = createInitialState({
		session: {
			card_ids: ["card-one"],
			total_cards: 1,
			reviewed_today: 0,
			shuffle: "no",
		},
		cards: [
			{
				id: "card-one",
				difficulty: 3,
				last_reviewed: "2026-04-20",
				front: "Q1",
				back: "A1",
			},
		],
	});
	state.sessionStartedAt = 0;
	state.cardStartedAt = 1_000;

	assert.deepEqual(getCurrentCardSummary(state, 62_000), {
		position: "1 of 1",
		reviewed: "Apr 20, 2026",
		cardTimer: "01:01",
		sessionTimer: "01:02",
	});
});

test("renderMarkdown renders markdown and sanitizes the resulting HTML before insertion", () => {
	const calls = [];
	const html = renderMarkdown("**hello**", {
		marked: {
			parse(markdown) {
				calls.push(["marked", markdown]);
				return `<p>${markdown}</p><script>alert(1)</script>`;
			},
		},
		DOMPurify: {
			sanitize(value) {
				calls.push(["sanitize", value]);
				return value.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
			},
		},
	});

	assert.deepEqual(calls, [
		["marked", "**hello**"],
		["sanitize", "<p>**hello**</p><script>alert(1)</script>"],
	]);
	assert.equal(html, "<p>**hello**</p>");
});

test("formatStackMode returns friendly labels for file order and shuffled sessions", () => {
	assert.equal(formatStackMode("yes"), "Shuffled session");
	assert.equal(formatStackMode("no"), "File order");
	assert.equal(APP_INFO.sourceFileLabel, "cards.md");
});

test("toggle label helpers match the current shell language", () => {
	assert.equal(UI_LABELS.guideToggle.show, "Show guide");
	assert.equal(UI_LABELS.guideToggle.hide, "Hide guide");
	assert.equal(UI_LABELS.sessionInfoToggle.show, "Show session info");
	assert.equal(UI_LABELS.sessionInfoToggle.hide, "Hide session info");
	assert.equal(formatGuideToggleLabel(false), "Show guide");
	assert.equal(formatGuideToggleLabel(true), "Hide guide");
	assert.equal(formatSessionToggleLabel(false), "Show session info");
	assert.equal(formatSessionToggleLabel(true), "Hide session info");
});

test("formatCurrentCardLabel shows the persistent top-bar card summary", () => {
	assert.equal(formatCurrentCardLabel({ total_cards: 7 }, 1), "2 of 7");
	assert.equal(
		formatCurrentCardLabel({ total_cards: 0 }, -1, "Loading…"),
		"Loading…",
	);
});

test("getSessionProgress exposes the current card position for the toolbar progress bar", () => {
	assert.deepEqual(getSessionProgress({ total_cards: 7 }, 1), {
		max: 7,
		value: 2,
	});
	assert.deepEqual(getSessionProgress({ total_cards: 0 }, -1), {
		max: 1,
		value: 0,
	});
});

test("createInitialState starts with the overview open, first card selected, and the back hidden", () => {
	const state = createInitialState({
		session: {
			card_ids: ["card-one", "card-two"],
			exclude_reviewed_today: true,
			total_cards: 2,
			reviewed_today: 1,
			shuffle: "no",
			filter_difficulty: [1, 2],
		},
		cards: [
			{
				id: "card-one",
				difficulty: 2,
				last_reviewed: "2026-04-25",
				front: "Q1",
				back: "A1",
			},
			{
				id: "card-two",
				difficulty: 4,
				last_reviewed: "2026-04-20",
				front: "Q2",
				back: "A2",
			},
		],
	});

	assert.equal(state.currentIndex, 0);
	assert.equal(state.isBackVisible, false);
	assert.equal(state.isOverviewVisible, true);
	assert.equal(state.isSessionBoxExpanded, false);
	assert.equal(state.sessionStartedAt, null);
	assert.equal(state.cardStartedAt, null);
	assert.equal(state.session.exclude_reviewed_today, true);
	assert.equal(getCurrentCard(state).id, "card-one");
	assert.equal(formatFilterLabel(state.session.filter_difficulty), "1, 2");
	assert.equal(
		formatSessionFilterSummary(state.session),
		"1, 2 · Skips cards already reviewed today",
	);
});

test("review filter helpers describe whether reviewed-today cards are included in the session", () => {
	assert.equal(formatReviewedFilterLabel(false), null);
	assert.equal(
		formatReviewedFilterLabel(true),
		"Skips cards already reviewed today",
	);
	assert.equal(
		formatSessionFilterSummary({
			filter_difficulty: null,
			exclude_reviewed_today: false,
		}),
		"All difficulties",
	);
	assert.equal(
		formatSessionFilterSummary({
			filter_difficulty: [1, 2, 3, 4, 5],
			exclude_reviewed_today: true,
		}),
		"All difficulties · Skips cards already reviewed today",
	);
});

test("setSessionBoxExpanded toggles the unified session box without changing card state", () => {
	const state = createInitialState({
		session: {
			card_ids: ["card-one", "card-two"],
			total_cards: 2,
			reviewed_today: 1,
			shuffle: "yes",
			filter_difficulty: null,
		},
		cards: [
			{
				id: "card-one",
				difficulty: 2,
				last_reviewed: "2026-04-25",
				front: "Q1",
				back: "A1",
			},
			{
				id: "card-two",
				difficulty: 4,
				last_reviewed: "2026-04-20",
				front: "Q2",
				back: "A2",
			},
		],
	});
	state.currentIndex = 1;

	const expandedState = setSessionBoxExpanded(state, true);
	assert.equal(expandedState.isSessionBoxExpanded, true);
	assert.equal(expandedState.currentIndex, 1);
	assert.equal(getCurrentCard(expandedState).id, "card-two");

	const collapsedState = setSessionBoxExpanded(expandedState, false);
	assert.equal(collapsedState.isSessionBoxExpanded, false);
	assert.equal(collapsedState.currentIndex, 1);
});

test("setOverviewVisibility toggles between overview and study mode without losing the current card", () => {
	const state = createInitialState({
		session: {
			card_ids: ["card-one", "card-two"],
			total_cards: 2,
			reviewed_today: 1,
			shuffle: "yes",
			filter_difficulty: null,
		},
		cards: [
			{
				id: "card-one",
				difficulty: 2,
				last_reviewed: "2026-04-25",
				front: "Q1",
				back: "A1",
			},
			{
				id: "card-two",
				difficulty: 4,
				last_reviewed: "2026-04-20",
				front: "Q2",
				back: "A2",
			},
		],
	});
	state.currentIndex = 1;

	const studyModeState = setOverviewVisibility(state, false);
	assert.equal(studyModeState.isOverviewVisible, false);
	assert.equal(studyModeState.currentIndex, 1);
	assert.equal(
		studyModeState.statusMessage,
		"Study mode ready. Front content is shown by default.",
	);

	const overviewState = setOverviewVisibility(studyModeState, true);
	assert.equal(overviewState.isOverviewVisible, true);
	assert.equal(overviewState.currentIndex, 1);
	assert.equal(
		overviewState.statusMessage,
		"Guide open. Your current card is preserved.",
	);
});

test("buildDifficultyOptions returns the 1–5 dropdown options with the selected value", () => {
	const options = buildDifficultyOptions(4);

	assert.deepEqual(DIFFICULTY_VALUES, [1, 2, 3, 4, 5]);
	assert.equal(DEFAULT_DIFFICULTY, 3);
	assert.equal(options.length, 5);
	assert.equal(options[0].value, 1);
	assert.equal(options[4].value, 5);
	assert.deepEqual(
		options.map((option) => option.label),
		["1", "2", "3", "4", "5"],
	);
	assert.equal(options.filter((option) => option.selected).length, 1);
	assert.equal(options.find((option) => option.selected).value, 4);
});

test("review helpers describe reviewed state and current-session undo availability", () => {
	const baseState = createInitialState({
		session: {
			card_ids: ["card-one"],
			total_cards: 1,
			reviewed_today: 0,
			shuffle: "no",
		},
		cards: [
			{
				id: "card-one",
				difficulty: 3,
				last_reviewed: "2026-04-20",
				front: "Q1",
				back: "A1",
			},
		],
	});
	baseState.isOverviewVisible = false;

	assert.equal(
		isCardReviewedToday(getCurrentCard(baseState), "2026-04-26"),
		false,
	);
	assert.equal(canUndoReview(baseState), false);
	assert.deepEqual(getNextReviewMutation(baseState, "2026-04-26"), {
		reviewed: true,
	});
	assert.deepEqual(getReviewButtonState(baseState, "2026-04-26"), {
		label: "Mark as Reviewed",
		title: "Mark as reviewed (R)",
		disabled: false,
		reviewed: false,
		undoable: false,
	});

	const reviewedState = {
		...baseState,
		cards: [
			{
				...baseState.cards[0],
				last_reviewed: "2026-04-26",
			},
		],
		reviewUndoDates: {
			"card-one": "2026-04-20",
		},
	};

	assert.equal(
		isCardReviewedToday(getCurrentCard(reviewedState), "2026-04-26"),
		true,
	);
	assert.equal(canUndoReview(reviewedState), true);
	assert.deepEqual(getNextReviewMutation(reviewedState, "2026-04-26"), {
		reviewed: false,
		restoreLastReviewed: "2026-04-20",
	});
	assert.deepEqual(getReviewButtonState(reviewedState, "2026-04-26"), {
		label: "Reviewed today",
		title: "Unmark reviewed (R)",
		disabled: false,
		reviewed: true,
		undoable: true,
	});
});

test("resolveKeyboardShortcut maps navigation, reveal/review, and difficulty shortcuts while respecting focus", () => {
	const baseState = createInitialState({
		session: {
			card_ids: ["card-one", "card-two"],
			total_cards: 2,
			reviewed_today: 0,
			shuffle: "no",
		},
		cards: [
			{
				id: "card-one",
				difficulty: 2,
				last_reviewed: "2026-04-20",
				front: "Q1",
				back: "A1",
			},
			{
				id: "card-two",
				difficulty: 4,
				last_reviewed: "2026-04-20",
				front: "Q2",
				back: "A2",
			},
		],
	});
	baseState.isOverviewVisible = false;

	assert.deepEqual(
		resolveKeyboardShortcut({ key: "ArrowRight", target: {} }, baseState),
		{ type: "next" },
	);
	assert.deepEqual(
		resolveKeyboardShortcut({ key: "1", target: {} }, baseState),
		{ type: "difficulty", value: 1 },
	);
	assert.deepEqual(
		resolveKeyboardShortcut({ key: "Enter", target: {} }, baseState),
		{ type: "toggleReveal" },
	);
	assert.deepEqual(
		resolveKeyboardShortcut(
			{ code: "Space", key: " ", target: {} },
			{ ...baseState, isBackVisible: true },
		),
		{ type: "toggleReveal" },
	);
	assert.deepEqual(
		resolveKeyboardShortcut({ key: "r", target: {} }, baseState),
		{ type: "reviewToggle" },
	);
	assert.equal(
		resolveKeyboardShortcut(
			{ key: "1", target: { tagName: "INPUT" } },
			baseState,
		),
		null,
	);
	assert.equal(
		resolveKeyboardShortcut(
			{ key: "Enter", target: { tagName: "BUTTON" } },
			baseState,
		),
		null,
	);
	assert.equal(
		resolveKeyboardShortcut(
			{ key: "ArrowLeft", metaKey: true, target: {} },
			baseState,
		),
		null,
	);
	assert.equal(
		resolveKeyboardShortcut(
			{ key: "r", target: {} },
			{
				...baseState,
				cards: [
					{
						...baseState.cards[0],
						last_reviewed: getTodayKey(),
					},
					baseState.cards[1],
				],
			},
		),
		null,
	);
});

test("moveIndex clamps previous and next navigation within the session bounds", () => {
	assert.equal(moveIndex(0, -1, 3), 0);
	assert.equal(moveIndex(1, 1, 3), 2);
	assert.equal(moveIndex(2, 1, 3), 2);
	assert.equal(moveIndex(-1, 1, 0), -1);
});

test("applyCardUpdate merges API responses without changing the current position", () => {
	const state = createInitialState({
		session: {
			card_ids: ["card-one", "card-two"],
			total_cards: 2,
			reviewed_today: 0,
			shuffle: "no",
		},
		cards: [
			{
				id: "card-one",
				difficulty: 2,
				last_reviewed: "2026-04-20",
				front: "Q1",
				back: "A1",
			},
			{
				id: "card-two",
				difficulty: 4,
				last_reviewed: "2026-04-20",
				front: "Q2",
				back: "A2",
			},
		],
	});
	state.currentIndex = 1;
	state.isOverviewVisible = false;

	const nextState = applyCardUpdate(state, {
		card: {
			id: "card-two",
			difficulty: 5,
			last_reviewed: "2026-04-26",
			front: "Q2",
			back: "A2",
		},
		session: {
			card_ids: ["card-one", "card-two"],
			total_cards: 2,
			reviewed_today: 1,
			shuffle: "no",
		},
	});

	assert.equal(nextState.currentIndex, 1);
	assert.equal(nextState.isOverviewVisible, false);
	assert.equal(nextState.cards[1].difficulty, 5);
	assert.equal(nextState.cards[1].last_reviewed, "2026-04-26");
	assert.equal(nextState.session.reviewed_today, 1);
});
