import { describe, expect, it } from "vitest";

import { resolveMessages, translateMessage } from "../i18n";

describe("ui/i18n", () => {
    it("resolves the English dictionary as base", () => {
        expect(resolveMessages("en-US").autoComplete).toBe("Auto Complete");
        expect(resolveMessages("unknown-x").addToQueue).toBe("Add to queue");
        expect(resolveMessages(undefined).cancel).toBe("Cancel");
    });

    it("overlays locale-specific translations on the base dictionary", () => {
        const messages = resolveMessages("de");
        expect(messages.autoComplete).not.toBe("Auto Complete");

        expect(messages.collecting).toBe("Orbs werden gesammelt...");
        expect(translateMessage("de-DE", "addToQueue")).toBe("Zur Warteschlange hinzufügen");
    });

    it("supports all 10 supported locales", () => {
        const locales = ["en-US", "de", "fr", "es", "it", "pt", "ru", "ja", "ko", "zh"];
        for (const locale of locales) {
            const messages = resolveMessages(locale);
            expect(messages.autoComplete).toBeTruthy();
            expect(messages.addToQueue).toBeTruthy();
            expect(messages.queue).toBeTruthy();
            expect(messages.cancel).toBeTruthy();
            expect(messages.unsupported).toBeTruthy();
            expect(messages.unsupportedAchievementInGame).toBeTruthy();
            expect(messages.unsupportedAchievementBypassOff).toBeTruthy();
        }
    });

    it("exposes the unsupported achievement labels", () => {
        expect(translateMessage("en-US", "unsupported")).toBe("Unsupported");
        expect(resolveMessages("de").unsupportedAchievementBypassOff).toContain(
            "Achievement-Bypass"
        );
    });

    it("falls back to English for unknown locales", () => {
        expect(resolveMessages("xx-XX").cancel).toBe("Cancel");
        expect(resolveMessages(null).addToQueue).toBe("Add to queue");
    });

    it("substitutes variables in messages", () => {
        expect(translateMessage("en-US", "queueCount", { count: 3 })).toBe("Queue (3)");
        expect(translateMessage("de", "statusRunning", { percent: " 42%" })).toBe("Läuft 42%");

        expect(translateMessage("en-US", "queueCount")).toBe("Queue ({count})");
    });
});
