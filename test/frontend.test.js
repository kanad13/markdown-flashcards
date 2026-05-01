const assert = require("node:assert/strict");
const test = require("node:test");

const {
	APP_INFO,
	DEFAULT_DIFFICULTY,
	DEFAULT_VIEW_SETTINGS,
	DIFFICULTY_VALUES,
	MERMAID_CONFIG,
	STUDY_DIFFICULTY_VALUES,
	UI_LABELS,
	applyCardUpdate,
	applyViewSettings,
	buildDifficultyOptions,
	canUndoReview,
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
	getCurrentCard,
	getCurrentCardSummary,
	getCurrentVisibleIndex,
	getNextReviewMutation,
	getReviewButtonState,
	getSessionProgress,
	getTodayKey,
	getVisibleCards,
	getVisibleSessionSummary,
	isCardReviewedToday,
	moveIndex,
	renderMarkdown,
	resolveKeyboardShortcut,
	setOverviewVisibility,
	setSessionBoxExpanded,
} = require("../public/app.js");

function createCard(id, difficulty, lastReviewed, front = "Q", back = "A") {
	return {
		id,
		difficulty,
		last_reviewed: lastReviewed,
		front,
		back,
	};
}

test("formatProgressText shows the live progress indicator format", () => {
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

	const state = createInitialState(
		{
			cards: [createCard("card-one", 2, "2026-04-20", "Q1", "A1")],
		},
		{ random: () => 0 },
	);
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

test("stack, filter, and toggle label helpers match the new live-session language", () => {
	assert.equal(formatStackMode("shuffle"), "Shuffled view");
	assert.equal(formatStackMode("file"), "File order");
	assert.equal(APP_INFO.sourceFileLabel, "cards.md");
	assert.equal(MERMAID_CONFIG.flowchart.htmlLabels, false);
	assert.equal(UI_LABELS.guideToggle.show, "Show guide");
	assert.equal(UI_LABELS.guideToggle.hide, "Hide guide");
	assert.equal(UI_LABELS.sessionInfoToggle.show, "Show session settings");
	assert.equal(UI_LABELS.sessionInfoToggle.hide, "Hide session settings");
	assert.equal(formatGuideToggleLabel(false), "Show guide");
	assert.equal(formatGuideToggleLabel(true), "Hide guide");
	assert.equal(formatSessionToggleLabel(false), "Show session settings");
	assert.equal(formatSessionToggleLabel(true), "Hide session settings");
	assert.equal(formatFilterLabel([1, 2, 3, 4, 5]), "Study cards");
	assert.equal(formatFilterLabel([0, 1, 2, 3, 4, 5]), "All difficulty levels");
	assert.equal(formatReviewedFilterLabel(true), null);
	assert.equal(formatReviewedFilterLabel(false), "Hides reviewed today");
	assert.equal(
		formatSessionFilterSummary({
			visibleDifficulties: [0, 1, 2, 3, 4, 5],
			showReviewedToday: false,
		}),
		"All difficulty levels · Hides reviewed today",
	);
});

test("createInitialState starts with live defaults and selects the first visible study card", () => {
	const state = createInitialState(
		{
			cards: [
				createCard("skipped-card", 0, "2026-04-25"),
				createCard("study-card", 2, "2026-04-24"),
			],
		},
		{ random: () => 0 },
	);

	assert.equal(state.currentCardId, "study-card");
	assert.equal(state.isBackVisible, false);
	assert.equal(state.isOverviewVisible, true);
	assert.equal(state.isSessionBoxExpanded, false);
	assert.equal(state.sessionStartedAt, null);
	assert.equal(state.cardStartedAt, null);
	assert.deepEqual(state.viewSettings, DEFAULT_VIEW_SETTINGS);
	assert.deepEqual(
		state.viewSettings.visibleDifficulties,
		STUDY_DIFFICULTY_VALUES,
	);
	assert.equal(getCurrentCard(state).id, "study-card");
	assert.deepEqual(
		getVisibleCards(state).map((card) => card.id),
		["study-card"],
	);
});

test("buildDifficultyOptions includes Skip (0) plus the study levels", () => {
	assert.deepEqual(
		buildDifficultyOptions(3).map((option) => option.value),
		DIFFICULTY_VALUES,
	);
	assert.equal(buildDifficultyOptions(0)[0].label, "Skip (0)");
	assert.equal(buildDifficultyOptions(0)[0].selected, true);
	assert.equal(buildDifficultyOptions(DEFAULT_DIFFICULTY)[3].selected, true);
});

test("applyViewSettings hides cards immediately and advances to the next matching card", () => {
	let state = createInitialState(
		{
			cards: [
				createCard("alpha", 2, "2026-04-20"),
				createCard("beta", 3, "2026-04-21"),
				createCard("gamma", 1, "2026-04-22"),
			],
		},
		{ random: () => 0 },
	);

	state = applyViewSettings(state, { order: "file" }, { nowMs: 1000 });
	assert.equal(state.currentCardId, "alpha");

	state = applyViewSettings(
		state,
		{ visibleDifficulties: [1] },
		{ nowMs: 2000, statusMessage: "Visible difficulties: 1." },
	);

	assert.equal(state.currentCardId, "gamma");
	assert.equal(getCurrentVisibleIndex(state), 0);
	assert.deepEqual(
		getVisibleCards(state).map((card) => card.id),
		["gamma"],
	);
	assert.equal(state.statusMessage, "Visible difficulties: 1.");
});

test("applyCardUpdate removes the current card from view when it becomes skipped", () => {
	let state = createInitialState(
		{
			cards: [
				createCard("alpha", 2, "2026-04-20"),
				createCard("beta", 1, "2026-04-21"),
			],
		},
		{ random: () => 0 },
	);

	state = applyViewSettings(state, { order: "file" }, { nowMs: 1000 });
	assert.equal(state.currentCardId, "alpha");

	const nextState = applyCardUpdate(
		state,
		{
			card: createCard("alpha", 0, "2026-04-20"),
		},
		{ nowMs: 2000 },
	);

	assert.equal(nextState.currentCardId, "beta");
	assert.deepEqual(
		getVisibleCards(nextState).map((card) => card.id),
		["beta"],
	);
});

test("review helpers describe reviewed state and immediate hide behavior when reviewed cards are hidden", () => {
	let state = createInitialState(
		{
			cards: [
				createCard("alpha", 2, "2026-04-20"),
				createCard("beta", 3, "2026-04-21"),
			],
		},
		{ random: () => 0 },
	);

	state = applyViewSettings(
		state,
		{ order: "file", showReviewedToday: false },
		{ nowMs: 1000 },
	);
	assert.deepEqual(getNextReviewMutation(state), { reviewed: true });
	assert.equal(canUndoReview(state), false);
	assert.deepEqual(getReviewButtonState(state, "2026-04-26"), {
		label: "Mark as Reviewed",
		title: "Mark as reviewed (R)",
		disabled: false,
		reviewed: false,
		undoable: false,
	});

	const nextState = applyCardUpdate(
		state,
		{
			card: createCard("alpha", 2, "2026-04-26"),
		},
		{ nowMs: 2000, todayKey: "2026-04-26" },
	);

	assert.equal(nextState.currentCardId, "beta");
	assert.deepEqual(
		getVisibleCards(nextState, "2026-04-26").map((card) => card.id),
		["beta"],
	);
	assert.deepEqual(getVisibleSessionSummary(nextState, "2026-04-26"), {
		total_cards: 1,
		reviewed_today: 1,
		deck_cards: 2,
		skipped_cards: 0,
	});
});

test("visible session summary reports ready-now, deck-level reviewed, and skipped counts", () => {
	let state = createInitialState(
		{
			cards: [
				createCard("alpha", 0, "2026-04-26"),
				createCard("beta", 2, "2026-04-26"),
				createCard("gamma", 4, "2026-04-20"),
			],
		},
		{ random: () => 0 },
	);

	state = applyViewSettings(state, { order: "file" }, { nowMs: 1000 });

	assert.deepEqual(getVisibleSessionSummary(state, "2026-04-26"), {
		total_cards: 2,
		reviewed_today: 2,
		deck_cards: 3,
		skipped_cards: 1,
	});
	assert.equal(
		isCardReviewedToday(getVisibleCards(state, "2026-04-26")[0], "2026-04-26"),
		true,
	);
});

test("reviewed-today summary still increases when reviewed cards are hidden from the current view", () => {
	let state = createInitialState(
		{
			cards: [
				createCard("alpha", 2, "2026-04-20"),
				createCard("beta", 4, "2026-04-20"),
			],
		},
		{ random: () => 0 },
	);

	state = applyViewSettings(
		state,
		{ order: "file", showReviewedToday: false },
		{ nowMs: 1000, todayKey: "2026-04-26" },
	);

	const nextState = applyCardUpdate(
		state,
		{
			card: createCard("alpha", 2, "2026-04-26"),
		},
		{ nowMs: 2000, todayKey: "2026-04-26" },
	);

	assert.deepEqual(
		getVisibleCards(nextState, "2026-04-26").map((card) => card.id),
		["beta"],
	);
	assert.deepEqual(getVisibleSessionSummary(nextState, "2026-04-26"), {
		total_cards: 1,
		reviewed_today: 1,
		deck_cards: 2,
		skipped_cards: 0,
	});
});

test("setSessionBoxExpanded and setOverviewVisibility keep the current card id intact", () => {
	const state = createInitialState(
		{
			cards: [
				createCard("card-one", 2, "2026-04-25"),
				createCard("card-two", 4, "2026-04-20"),
			],
		},
		{ random: () => 0 },
	);
	const expandedState = setSessionBoxExpanded(state, true);
	assert.equal(expandedState.isSessionBoxExpanded, true);
	assert.equal(expandedState.currentCardId, state.currentCardId);

	const overviewState = setOverviewVisibility(expandedState, false);
	assert.equal(overviewState.isOverviewVisible, false);
	assert.equal(overviewState.currentCardId, state.currentCardId);
	assert.equal(
		overviewState.statusMessage,
		"Study mode ready. Front content is shown by default.",
	);
});

test("resolveKeyboardShortcut maps navigation, reveal/review, and 0-5 difficulty shortcuts while respecting focus", () => {
	let state = createInitialState(
		{
			cards: [
				createCard("alpha", 2, "2026-04-20"),
				createCard("beta", 4, "2026-04-20"),
			],
		},
		{ random: () => 0 },
	);
	state = applyViewSettings(state, { order: "file" }, { nowMs: 1000 });
	state = setOverviewVisibility(state, false);
	state.currentCardId = "alpha";
	state.reviewUndoDates = { alpha: "2026-04-20" };

	assert.deepEqual(resolveKeyboardShortcut({ key: "0" }, state), {
		type: "difficulty",
		value: 0,
	});
	assert.deepEqual(resolveKeyboardShortcut({ key: "ArrowRight" }, state), {
		type: "next",
	});
	assert.deepEqual(resolveKeyboardShortcut({ key: "r" }, state), {
		type: "reviewToggle",
	});
	assert.deepEqual(resolveKeyboardShortcut({ key: " " }, state), {
		type: "toggleReveal",
	});
	assert.equal(
		resolveKeyboardShortcut(
			{
				key: "1",
				target: { tagName: "INPUT" },
			},
			state,
		),
		null,
	);
});

test("current card labels and session progress helpers stay consistent", () => {
	assert.equal(formatCurrentCardLabel({ total_cards: 7 }, 1), "2 of 7");
	assert.equal(
		formatCurrentCardLabel({ total_cards: 0 }, -1, "Loading…"),
		"Loading…",
	);
	assert.deepEqual(getSessionProgress({ total_cards: 7 }, 1), {
		max: 7,
		value: 2,
	});
	assert.deepEqual(getSessionProgress({ total_cards: 0 }, -1), {
		max: 1,
		value: 0,
	});
	assert.equal(getTodayKey(new Date("2026-04-26T12:00:00.000Z")), "2026-04-26");
	assert.equal(moveIndex(1, 1, 4), 2);
	assert.equal(moveIndex(0, -1, 4), 0);
});
