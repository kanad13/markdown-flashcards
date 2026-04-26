const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("frontend shell loads marked and DOMPurify from CDNs and exposes the corner-anchored show-hide shell plus stable toolbar", () => {
	const html = fs.readFileSync(
		path.join(__dirname, "..", "public", "index.html"),
		"utf8",
	);

	assert.match(html, /marked/i);
	assert.match(html, /dompurify|purify/i);
	assert.match(html, /id="session-shell"/);
	assert.match(html, /id="session-shell-controls"/);
	assert.match(html, /id="session-toggle-button"/);
	assert.match(html, /id="session-shell-body"/);
	assert.match(html, /id="session-info-strip"/);
	assert.match(html, /id="session-summary"/);
	assert.match(html, /id="current-card-text"/);
	assert.match(html, /id="current-reviewed-text"/);
	assert.match(html, /id="current-card-timer-text"/);
	assert.match(html, /id="session-timer-text"/);
	assert.match(html, /id="overview-panel"/);
	assert.match(html, /id="start-study-button"/);
	assert.match(html, /id="overview-toggle-button"/);
	assert.match(html, /id="study-toolbar"/);
	assert.match(html, /id="difficulty-field"/);
	assert.match(html, /id="difficulty-select"/);
	assert.match(html, /id="session-progress"/);
	assert.match(html, /id="navigation-group"/);
	assert.match(html, /id="front-content"/);
	assert.match(html, /id="back-content"/);
	assert.match(html, /id="answer-divider"/);
	assert.match(html, /id="reveal-button"/);
	assert.match(html, /id="review-button"/);
	assert.match(html, /id="previous-button"/);
	assert.match(html, /id="next-button"/);
	assert.match(html, /id="session-filters"/);
	assert.match(html, /aria-keyshortcuts="ArrowLeft"/);
	assert.match(html, /aria-keyshortcuts="ArrowRight"/);
	assert.match(html, />Hide\s+guide</);
	assert.match(html, />Show\s+session info</);
	assert.match(html, /aria-pressed="true">Hide\s+guide/);
	assert.match(html, /aria-pressed="false">Show\s+session info/);
	assert.match(html, />Current card</);
	assert.match(html, />Position</);
	assert.match(html, />Last reviewed</);
	assert.match(html, />On card</);
	assert.match(html, />Session</);
	assert.doesNotMatch(html, /id="session-source-file"/);
	assert.match(
		html,
		/Space<\/strong>\s*\/\s*<strong>Enter<\/strong>\s+to reveal or hide/i,
	);
	assert.match(html, /<strong>R<\/strong>\s+to toggle\s+reviewed status/i);
	assert.match(html, /exclude_reviewed_today/i);
	assert.match(html, /Start with the flow/i);
	assert.match(
		html,
		/Read this once to understand what the top banner tells you/i,
	);
	assert.match(
		html,
		/Show session info<\/strong> above for order, filters, eligible count, and reviewed-today count/i,
	);
	assert.match(
		html,
		/Start studying<\/strong> and keep the guide one toggle away/i,
	);
	assert.match(html, /guide-band/i);
	assert.doesNotMatch(html, /Before you start/i);
	assert.doesNotMatch(html, /id="session-details-panel"/);
	assert.doesNotMatch(html, /id="summary-strip"/);
	assert.doesNotMatch(html, /id="content-scroller"/);
	assert.doesNotMatch(html, /id="action-bar"/);
	assert.doesNotMatch(html, /id="study-action-row"/);
	assert.doesNotMatch(html, /id="session-app-group"/);
	assert.doesNotMatch(html, /id="session-heading"/);
	assert.doesNotMatch(html, /id="navigation-pod"/);
	assert.doesNotMatch(html, /id="card-side-label"/);
	assert.doesNotMatch(html, /id="current-card-strip"/);
	assert.doesNotMatch(html, /class="face-heading-row"/);
	assert.doesNotMatch(html, /class="face-kicker"/);
	assert.doesNotMatch(html, /id="overview-source-file"/);
	assert.doesNotMatch(html, /id="overview-session-filters"/);
	assert.doesNotMatch(html, /id="overview-stack-mode"/);
	assert.doesNotMatch(html, /id="overview-eligible-count"/);
	assert.doesNotMatch(html, /id="overview-reviewed-today"/);
	assert.doesNotMatch(html, /Navigate/);
	assert.doesNotMatch(html, /Actions/);
	assert.doesNotMatch(html, /LOCAL-FIRST STUDY SESSION/);
	assert.doesNotMatch(
		html,
		/<p class="app-name">Local Markdown Flashcards<\/p>/,
	);
	assert.doesNotMatch(html, /npm start/);
	assert.doesNotMatch(html, /Ctrl\+C/);
});
