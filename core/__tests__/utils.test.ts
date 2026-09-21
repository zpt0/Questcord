import { describe, it, expect } from "vitest";
import { formatReleaseNotesForDiscord } from "../utils";

describe("formatReleaseNotesForDiscord", () => {
    it("converts headings to bold since Discord has no headings", () => {
        expect(formatReleaseNotesForDiscord("## What's Changed")).toBe("**What's Changed**");
        expect(formatReleaseNotesForDiscord("### Quest reliability bundle")).toBe(
            "**Quest reliability bundle**"
        );
    });

    it("turns single newlines into paragraph breaks", () => {
        expect(formatReleaseNotesForDiscord("line one\nline two")).toBe("line one\n\nline two");
    });

    it("keeps existing blank lines without stacking", () => {
        expect(formatReleaseNotesForDiscord("para one\n\npara two")).toBe("para one\n\npara two");
        expect(formatReleaseNotesForDiscord("a\n\n\n\nb")).toBe("a\n\nb");
    });

    it("drops horizontal rules", () => {
        expect(formatReleaseNotesForDiscord("above\n---\nbelow")).toBe("above\n\nbelow");
    });

    it("leaves fenced code blocks untouched", () => {
        const input = "intro\n```\n## not a heading\nline one\nline two\n```\noutro";
        expect(formatReleaseNotesForDiscord(input)).toBe(
            "intro\n\n```\n## not a heading\nline one\nline two\n```\n\noutro"
        );
    });

    it("normalizes CRLF and trims", () => {
        expect(formatReleaseNotesForDiscord("\r\n## Title\r\nbody\r\n")).toBe("**Title**\n\nbody");
    });

    it("handles empty input", () => {
        expect(formatReleaseNotesForDiscord("")).toBe("");
    });

    it("formats a realistic release body", () => {
        const input =
            "## What's Changed\n\n### Dev dependencies\nBumps across the board.\nNo functional changes.\n\n---\n\n**Full Changelog**: https://example.com/compare";
        expect(formatReleaseNotesForDiscord(input)).toBe(
            "**What's Changed**\n\n**Dev dependencies**\n\nBumps across the board.\n\nNo functional changes.\n\n**Full Changelog**: https://example.com/compare"
        );
    });
});
