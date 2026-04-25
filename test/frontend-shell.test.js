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
	assert.match(html, /id="current-card-strip"/);
	assert.match(html, /id="overview-panel"/);
	assert.match(html, /id="start-study-button"/);
	assert.match(html, /id="overview-toggle-button"/);
	assert.match(html, /id="progress-text"/);
	assert.match(html, /id="study-toolbar"/);
	assert.match(html, /id="difficulty-field"/);
	assert.match(html, /id="navigation-group"/);
	assert.match(html, /id="front-content"/);
	assert.match(html, /id="back-content"/);
	assert.match(html, /id="difficulty-select"/);
	assert.match(html, /id="reveal-button"/);
	assert.match(html, /id="review-button"/);
	assert.match(html, /id="previous-button"/);
	assert.match(html, /id="next-button"/);
	assert.match(html, />Hide\s+guide</);
	assert.match(html, />Show\s+session info</);
	assert.match(html, /aria-pressed="true">Hide\s+guide/);
	assert.match(html, /aria-pressed="false">Show\s+session info/);
	assert.doesNotMatch(html, /id="session-details-panel"/);
	assert.doesNotMatch(html, /id="summary-strip"/);
	assert.doesNotMatch(html, /id="content-scroller"/);
	assert.doesNotMatch(html, /id="action-bar"/);
	assert.doesNotMatch(html, /id="study-action-row"/);
	assert.doesNotMatch(html, /id="session-app-group"/);
	assert.doesNotMatch(html, /id="session-heading"/);
	assert.doesNotMatch(html, /id="navigation-pod"/);
	assert.doesNotMatch(html, /Navigate/);
	assert.doesNotMatch(html, /Actions/);
	assert.doesNotMatch(html, /LOCAL-FIRST STUDY SESSION/);
	assert.doesNotMatch(
		html,
		/<p class="app-name">Local Markdown Flashcards<\/p>/,
	);
	assert.match(html, /npm start/);
	assert.match(html, /Ctrl\+C/);
});
