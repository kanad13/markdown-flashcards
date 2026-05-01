const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("frontend shell loads markdown, mermaid, and KaTeX assets and exposes the live settings shell", () => {
	const html = fs.readFileSync(
		path.join(__dirname, "..", "public", "index.html"),
		"utf8",
	);

	assert.match(html, /marked/i);
	assert.match(html, /dompurify|purify/i);
	assert.match(html, /mermaid/i);
	assert.match(html, /katex/i);
	assert.match(html, /id="session-shell"/);
	assert.match(html, /id="session-shell-controls"/);
	assert.match(html, /id="session-toggle-button"/);
	assert.match(html, /id="session-shell-body"/);
	assert.match(html, /id="session-settings-grid"/);
	assert.match(html, /id="order-file-button"/);
	assert.match(html, /id="order-shuffle-button"/);
	assert.match(html, /id="reviewed-show-button"/);
	assert.match(html, /id="reviewed-hide-button"/);
	assert.match(html, /id="difficulty-filter-group"/);
	assert.match(html, /data-difficulty-filter/);
	assert.match(html, /id="visible-count"/);
	assert.match(html, /id="deck-count"/);
	assert.match(html, /id="skipped-count"/);
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
	assert.match(html, />Hide\s+guide</);
	assert.match(html, />Show\s+session settings</);
	assert.match(html, /aria-pressed="true">Hide\s+guide/);
	assert.match(html, /aria-pressed="false">Show\s+session settings/);
	assert.match(html, />Current card</);
	assert.match(html, />Ready now</);
	assert.match(html, />Total cards</);
	assert.match(html, />Reviewed today</);
	assert.match(html, />Skipped cards</);
	assert.match(html, />Session snapshot</);
	assert.match(
		html,
		/Ready now follows your live filters\. Reviewed and skipped totals cover the whole deck\./,
	);
	assert.match(html, />Position</);
	assert.match(html, />Last reviewed</);
	assert.match(html, />On card</);
	assert.match(html, />Session</);
	assert.match(html, /Skip \(0\)/);
	assert.match(html, /Study with live controls/i);
	assert.match(html, /What does the `===` operator check in JavaScript\?/);
	assert.match(html, /Strict equality — it compares both value and type\./);
	assert.doesNotMatch(html, /Render this diagram:/);
	assert.match(
		html,
		/session panel now owns order, reviewed visibility, and difficulty filters/i,
	);
	assert.match(html, /0–5/);
	assert.match(html, /Mermaid/i);
	assert.match(html, /KaTeX/i);
	assert.doesNotMatch(html, /id="session-filters"/);
	assert.doesNotMatch(html, /id="stack-mode"/);
	assert.doesNotMatch(html, /id="eligible-count"/);
	assert.doesNotMatch(html, /filter_difficulty/i);
	assert.doesNotMatch(html, /exclude_reviewed_today/i);
	assert.doesNotMatch(
		html,
		/Changes to session settings in <code>cards\.md<\/code> apply after restart/i,
	);
});
