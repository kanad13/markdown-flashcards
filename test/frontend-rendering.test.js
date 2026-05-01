const assert = require("node:assert/strict");
const test = require("node:test");

const {
	KATEX_DELIMITERS,
	MERMAID_CONFIG,
	renderMathInContainer,
	renderMermaidBlocks,
} = require("../public/app.js");

function createFakeDocument() {
	return {
		createElement(tagName) {
			return {
				tagName,
				className: "",
				innerHTML: "",
				textContent: "",
			};
		},
	};
}

function createMermaidHarness(definition = "flowchart LR\n  A --> B") {
	const pre = {
		replacedWithNode: null,
		notes: [],
		replaceWith(node) {
			this.replacedWithNode = node;
		},
		before(node) {
			this.notes.push(node);
		},
	};

	return {
		pre,
		container: {
			querySelectorAll(selector) {
				assert.equal(selector, "pre > code.language-mermaid");
				return [
					{
						textContent: definition,
						parentElement: pre,
					},
				];
			},
		},
	};
}

test("renderMathInContainer delegates to KaTeX auto-render with the configured delimiters", () => {
	const calls = [];
	const container = { id: "front" };

	renderMathInContainer(container, {
		renderMathInElement(node, options) {
			calls.push({ node, options });
		},
	});

	assert.equal(calls.length, 1);
	assert.equal(calls[0].node, container);
	assert.deepEqual(calls[0].options.delimiters, KATEX_DELIMITERS);
	assert.equal(calls[0].options.throwOnError, false);
	assert.equal(calls[0].options.strict, "ignore");
});

test("Mermaid is configured to use SVG text labels so flowchart text survives sanitization", () => {
	assert.equal(MERMAID_CONFIG.startOnLoad, false);
	assert.equal(MERMAID_CONFIG.securityLevel, "strict");
	assert.equal(MERMAID_CONFIG.theme, "neutral");
	assert.deepEqual(MERMAID_CONFIG.flowchart, {
		htmlLabels: false,
	});
});

test("renderMermaidBlocks replaces Mermaid fences with sanitized SVG hosts", async () => {
	const calls = [];
	const { container, pre } = createMermaidHarness();

	await renderMermaidBlocks(container, {
		document: createFakeDocument(),
		DOMPurify: {
			sanitize(value, options) {
				calls.push(["sanitize", value, options]);
				return "<svg><g></g></svg>";
			},
		},
		mermaid: {
			async render(id, definition) {
				calls.push(["render", id, definition]);
				return { svg: "<svg><script>bad()</script><g></g></svg>" };
			},
		},
	});

	assert.equal(calls[0][0], "render");
	assert.match(calls[0][1], /^mermaid-\d+$/);
	assert.equal(calls[0][2], "flowchart LR\n  A --> B");
	assert.equal(calls[1][0], "sanitize");
	assert.deepEqual(calls[1][2], {
		USE_PROFILES: { svg: true, svgFilters: true },
	});
	assert.equal(pre.replacedWithNode.className, "mermaid-host");
	assert.equal(pre.replacedWithNode.innerHTML, "<svg><g></g></svg>");
});

test("renderMermaidBlocks adds a readable note when Mermaid rendering fails", async () => {
	const { container, pre } = createMermaidHarness(
		"flowchart LR\n  Broken --> Diagram",
	);

	await renderMermaidBlocks(container, {
		document: createFakeDocument(),
		DOMPurify: {
			sanitize(value) {
				return value;
			},
		},
		mermaid: {
			async render() {
				throw new Error("broken mermaid");
			},
		},
	});

	assert.equal(pre.replacedWithNode, null);
	assert.equal(pre.notes.length, 1);
	assert.equal(pre.notes[0].className, "render-note");
	assert.match(pre.notes[0].textContent, /Mermaid could not be rendered/);
});
