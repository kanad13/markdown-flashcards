const assert = require("node:assert/strict");
const test = require("node:test");

const {
	APP_INFO,
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
	renderMarkdown,
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

test("toggle label helpers and card-side labels match the current shell language", () => {
	assert.equal(UI_LABELS.guideToggle.show, "Show guide");
	assert.equal(UI_LABELS.guideToggle.hide, "Hide guide");
	assert.equal(UI_LABELS.sessionInfoToggle.show, "Show session info");
	assert.equal(UI_LABELS.sessionInfoToggle.hide, "Hide session info");
	assert.equal(formatGuideToggleLabel(false), "Show guide");
	assert.equal(formatGuideToggleLabel(true), "Hide guide");
	assert.equal(formatSessionToggleLabel(false), "Show session info");
	assert.equal(formatSessionToggleLabel(true), "Hide session info");
	assert.equal(formatCardSideLabel(false), "Front");
	assert.equal(formatCardSideLabel(true), "Front + Back");
});

test("createInitialState starts with the overview open, first card selected, and the back hidden", () => {
	const state = createInitialState({
		session: {
			card_ids: ["card-one", "card-two"],
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
	assert.equal(getCurrentCard(state).id, "card-one");
	assert.equal(formatFilterLabel(state.session.filter_difficulty), "1, 2");
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

test("buildDifficultyOptions always returns 10 options with the requested value selected", () => {
	const options = buildDifficultyOptions(6);

	assert.equal(options.length, 10);
	assert.equal(options[0].value, 1);
	assert.equal(options[9].value, 10);
	assert.equal(options.filter((option) => option.selected).length, 1);
	assert.equal(options.find((option) => option.selected).value, 6);
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
			difficulty: 7,
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
	assert.equal(nextState.cards[1].difficulty, 7);
	assert.equal(nextState.cards[1].last_reviewed, "2026-04-26");
	assert.equal(nextState.session.reviewed_today, 1);
});
