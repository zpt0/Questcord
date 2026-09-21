import { describe, it, expect } from "vitest";
import { isSafeReleaseUrl, parseReleaseBlocks, parseReleaseInline } from "../utils";

describe("isSafeReleaseUrl", () => {
    it("allows http and https links", () => {
        expect(isSafeReleaseUrl("https://github.com/zpt0/Questcord")).toBe(true);
        expect(isSafeReleaseUrl("http://example.com/a?b=c")).toBe(true);
    });

    it("rejects javascript and other schemes", () => {
        expect(isSafeReleaseUrl("javascript:alert(1)")).toBe(false);
        expect(isSafeReleaseUrl("data:text/plain,hi")).toBe(false);
        expect(isSafeReleaseUrl("not a url")).toBe(false);
    });
});

describe("parseReleaseInline", () => {
    it("parses bold text", () => {
        expect(parseReleaseInline("a **bold** move")).toEqual([
            { kind: "text", text: "a " },
            { kind: "bold", children: [{ kind: "text", text: "bold" }] },
            { kind: "text", text: " move" },
        ]);
    });

    it("parses italic, strikethrough and code spans", () => {
        expect(parseReleaseInline("*italic* and _also_")).toEqual([
            { kind: "italic", children: [{ kind: "text", text: "italic" }] },
            { kind: "text", text: " and " },
            { kind: "italic", children: [{ kind: "text", text: "also" }] },
        ]);
        expect(parseReleaseInline("~~gone~~")).toEqual([
            { kind: "strike", children: [{ kind: "text", text: "gone" }] },
        ]);
        expect(parseReleaseInline("run `npm test` now")).toEqual([
            { kind: "text", text: "run " },
            { kind: "code", text: "npm test" },
            { kind: "text", text: " now" },
        ]);
    });

    it("keeps code span content literal", () => {
        expect(parseReleaseInline("`## not bold **[x](y)**`")).toEqual([
            { kind: "code", text: "## not bold **[x](y)**" },
        ]);
    });

    it("parses markdown links with safe urls", () => {
        expect(parseReleaseInline("see [releases](https://github.com/a/b)")).toEqual([
            { kind: "text", text: "see " },
            { kind: "link", text: "releases", url: "https://github.com/a/b" },
        ]);
    });

    it("leaves unsafe links as plain text", () => {
        const nodes = parseReleaseInline("[x](javascript:alert(1))");
        expect(nodes.some((node) => node.kind === "link")).toBe(false);
        expect(nodes.map((node) => (node.kind === "text" ? node.text : "")).join("")).toBe(
            "[x](javascript:alert(1))"
        );
    });

    it("ignores intraword underscores like snake_case", () => {
        expect(parseReleaseInline("the checkForUpdate helper")).toEqual([
            { kind: "text", text: "the checkForUpdate helper" },
        ]);
        expect(parseReleaseInline("some_var stays")).toEqual([
            { kind: "text", text: "some_var stays" },
        ]);
    });

    it("leaves unmatched markers as plain text", () => {
        expect(parseReleaseInline("a ** broken [link](nospace here)")).toEqual([
            { kind: "text", text: "a ** broken [link](nospace here)" },
        ]);
    });

    it("autolinks bare urls", () => {
        expect(parseReleaseInline("see https://example.com/a for details")).toEqual([
            { kind: "text", text: "see " },
            { kind: "link", text: "https://example.com/a", url: "https://example.com/a" },
            { kind: "text", text: " for details" },
        ]);
    });

    it("trims trailing punctuation from bare urls", () => {
        expect(parseReleaseInline("visit https://example.com/a.")).toEqual([
            { kind: "text", text: "visit " },
            { kind: "link", text: "https://example.com/a", url: "https://example.com/a" },
            { kind: "text", text: "." },
        ]);
    });

    it("does not autolink inside code spans", () => {
        expect(parseReleaseInline("`https://example.com/a`")).toEqual([
            { kind: "code", text: "https://example.com/a" },
        ]);
    });

    it("autolinks inside bold text", () => {
        expect(parseReleaseInline("**see https://example.com/a**")).toEqual([
            {
                kind: "bold",
                children: [
                    { kind: "text", text: "see " },
                    { kind: "link", text: "https://example.com/a", url: "https://example.com/a" },
                ],
            },
        ]);
    });
});

describe("parseReleaseBlocks", () => {
    it("returns no blocks for empty input", () => {
        expect(parseReleaseBlocks("")).toEqual([]);
        expect(parseReleaseBlocks("   \r\n  ")).toEqual([]);
    });

    it("parses headings with levels", () => {
        expect(parseReleaseBlocks("## What's Changed")).toEqual([
            { kind: "heading", level: 2, text: "What's Changed" },
        ]);
        expect(parseReleaseBlocks("# Top\n### Deep")).toEqual([
            { kind: "heading", level: 1, text: "Top" },
            { kind: "heading", level: 3, text: "Deep" },
        ]);
    });

    it("keeps single newlines as paragraph lines", () => {
        expect(parseReleaseBlocks("line one\nline two")).toEqual([
            { kind: "paragraph", lines: ["line one", "line two"] },
        ]);
    });

    it("splits paragraphs on blank lines", () => {
        expect(parseReleaseBlocks("para one\n\npara two")).toEqual([
            { kind: "paragraph", lines: ["para one"] },
            { kind: "paragraph", lines: ["para two"] },
        ]);
    });

    it("drops horizontal rules", () => {
        expect(parseReleaseBlocks("above\n---\nbelow")).toEqual([
            { kind: "paragraph", lines: ["above"] },
            { kind: "paragraph", lines: ["below"] },
        ]);
    });

    it("groups consecutive list items and splits on type change", () => {
        expect(parseReleaseBlocks("- a\n- b\n\n1. one\n2. two")).toEqual([
            { kind: "list", ordered: false, items: ["a", "b"] },
            { kind: "list", ordered: true, items: ["one", "two"] },
        ]);
    });

    it("parses quotes and fenced code blocks untouched", () => {
        expect(
            parseReleaseBlocks("> note this\n\n```\n## not a heading\n**no bold**\n```")
        ).toEqual([
            { kind: "quote", lines: ["note this"] },
            { kind: "code", text: "## not a heading\n**no bold**" },
        ]);
    });

    it("normalizes CRLF", () => {
        expect(parseReleaseBlocks("\r\n## Title\r\nbody\r\n")).toEqual([
            { kind: "heading", level: 2, text: "Title" },
            { kind: "paragraph", lines: ["body"] },
        ]);
    });

    it("parses a realistic release body", () => {
        const input =
            "## What's Changed\n\n### Update-modal release notes\n\nFixed the **modal** rendering as one line.\nSee [releases](https://github.com/a/b) for details.\n\n- item one\n- item two\n\n---\n\n**Full Changelog**: https://github.com/a/b/compare";
        expect(parseReleaseBlocks(input)).toEqual([
            { kind: "heading", level: 2, text: "What's Changed" },
            { kind: "heading", level: 3, text: "Update-modal release notes" },
            {
                kind: "paragraph",
                lines: [
                    "Fixed the **modal** rendering as one line.",
                    "See [releases](https://github.com/a/b) for details.",
                ],
            },
            { kind: "list", ordered: false, items: ["item one", "item two"] },
            { kind: "paragraph", lines: ["**Full Changelog**: https://github.com/a/b/compare"] },
        ]);
    });
});
