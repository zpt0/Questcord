import { describe, it, expect, beforeEach } from "vitest";
import {
    activeQuests,
    progressBars,
    cleanupFunctions,
    isPluginStopping,
    setPluginStopping,
    getProgressBarKey,
    parseProgressBarKey,
    debugLog,
} from "../state";

describe("getProgressBarKey", () => {
    it("creates key from questId and userId", () => {
        expect(getProgressBarKey("q1", "u1")).toBe("q1:u1");
    });

    it("handles empty strings", () => {
        expect(getProgressBarKey("", "")).toBe(":");
    });

    it("handles special characters", () => {
        expect(getProgressBarKey("quest-123", "user-456")).toBe("quest-123:user-456");
    });
});

describe("parseProgressBarKey", () => {
    it("parses valid key", () => {
        const result = parseProgressBarKey("q1:u1");
        expect(result).toEqual({ questId: "q1", userId: "u1" });
    });

    it("returns null for key without separator", () => {
        expect(parseProgressBarKey("noseparator")).toBeNull();
    });

    it("returns null for key with multiple separators", () => {
        expect(parseProgressBarKey("a:b:c")).toBeNull();
    });

    it("handles empty parts", () => {
        const result = parseProgressBarKey(":");
        expect(result).toEqual({ questId: "", userId: "" });
    });
});

describe("setPluginStopping", () => {
    beforeEach(() => {
        setPluginStopping(false);
    });

    it("sets isPluginStopping", () => {
        setPluginStopping(true);
        expect(isPluginStopping).toBe(true);
        setPluginStopping(false);
        expect(isPluginStopping).toBe(false);
    });
});

describe("state maps", () => {
    beforeEach(() => {
        activeQuests.clear();
        progressBars.clear();
        cleanupFunctions.clear();
    });

    it("activeQuests starts empty", () => {
        expect(activeQuests.size).toBe(0);
    });

    it("progressBars starts empty", () => {
        expect(progressBars.size).toBe(0);
    });

    it("cleanupFunctions starts empty", () => {
        expect(cleanupFunctions.size).toBe(0);
    });
});

describe("debugLog", () => {
    it("does not throw when no debug store set", () => {
        expect(() => debugLog("test")).not.toThrow();
    });
});
