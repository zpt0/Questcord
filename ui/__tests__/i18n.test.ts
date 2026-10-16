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
        // Locale overlays extend, not replace, translated keys.
        expect(messages.collecting).toBe("Orbs werden gesammelt...");
        expect(translateMessage("de-DE", "addToQueue")).toBe("Zur Warteschlange hinzufügen");
    });

    it("substitutes variables in messages", () => {
        expect(translateMessage("en-US", "queueCount", { count: 3 })).toBe("Queue (3)");
        expect(translateMessage("de", "statusRunning", { percent: " 42%" })).toBe("Läuft 42%");
        // Unknown variables are left untouched.
        expect(translateMessage("en-US", "queueCount")).toBe("Queue ({count})");
    });
});
