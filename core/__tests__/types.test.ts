import { describe, it, expect } from "vitest";
import {
    Quest,
    TaskConfig,
    getTaskConfig,
    resolveApplicationId,
    resolveApplicationName,
    getQuestName,
    isVideoTask,
} from "../types";

describe("getTaskConfig", () => {
    it("returns null for empty quest", () => {
        expect(getTaskConfig({ id: "1" })).toBeNull();
    });

    it("prefers config.taskConfig", () => {
        const tc: TaskConfig = { tasks: { PLAY_ON_DESKTOP: { target: 100 } } };
        const quest: Quest = { id: "1", config: { taskConfig: tc } };
        expect(getTaskConfig(quest)).toBe(tc);
    });

    it("falls back to config.taskConfigV2", () => {
        const tc: TaskConfig = { tasks: { WATCH_VIDEO: { target: 60 } } };
        const quest: Quest = { id: "1", config: { taskConfigV2: tc } };
        expect(getTaskConfig(quest)).toBe(tc);
    });

    it("falls back to root taskConfig", () => {
        const tc: TaskConfig = { tasks: { STREAM_ON_DESKTOP: { target: 300 } } };
        const quest: Quest = { id: "1", taskConfig: tc };
        expect(getTaskConfig(quest)).toBe(tc);
    });

    it("falls back to root taskConfigV2", () => {
        const tc: TaskConfig = { tasks: { PLAY_ACTIVITY: { target: 50 } } };
        const quest: Quest = { id: "1", taskConfigV2: tc };
        expect(getTaskConfig(quest)).toBe(tc);
    });
});

describe("resolveApplicationId", () => {
    it("returns null for empty quest", () => {
        expect(resolveApplicationId({ id: "1" })).toBeNull();
    });

    it("resolves from config.application.id", () => {
        const quest: Quest = { id: "1", config: { application: { id: "app-123" } } };
        expect(resolveApplicationId(quest)).toBe("app-123");
    });

    it("resolves from config.applicationId", () => {
        const quest: Quest = { id: "1", config: { applicationId: "app-456" } };
        expect(resolveApplicationId(quest)).toBe("app-456");
    });

    it("resolves from config.application_id", () => {
        const quest: Quest = { id: "1", config: { application_id: "app-789" } };
        expect(resolveApplicationId(quest)).toBe("app-789");
    });

    it("resolves from root application.id", () => {
        const quest: Quest = { id: "1", application: { id: "root-app" } };
        expect(resolveApplicationId(quest)).toBe("root-app");
    });

    it("resolves from root applicationId", () => {
        const quest: Quest = { id: "1", applicationId: "root-123" };
        expect(resolveApplicationId(quest)).toBe("root-123");
    });

    it("resolves from root application_id", () => {
        const quest: Quest = { id: "1", application_id: "root-456" };
        expect(resolveApplicationId(quest)).toBe("root-456");
    });
});

describe("resolveApplicationName", () => {
    it("returns Unknown App for empty quest", () => {
        expect(resolveApplicationName({ id: "1" })).toBe("Unknown App");
    });

    it("resolves from config.application.name", () => {
        const quest: Quest = { id: "1", config: { application: { name: "My App" } } };
        expect(resolveApplicationName(quest)).toBe("My App");
    });

    it("resolves from config.applicationName", () => {
        const quest: Quest = { id: "1", config: { applicationName: "Config App" } };
        expect(resolveApplicationName(quest)).toBe("Config App");
    });

    it("resolves from root application.name", () => {
        const quest: Quest = { id: "1", application: { name: "Root App" } };
        expect(resolveApplicationName(quest)).toBe("Root App");
    });

    it("resolves from root applicationName", () => {
        const quest: Quest = { id: "1", applicationName: "Root Name" };
        expect(resolveApplicationName(quest)).toBe("Root Name");
    });
});

describe("getQuestName", () => {
    it("returns fallback for empty quest", () => {
        expect(getQuestName({ id: "1" })).toBe("Quest");
        expect(getQuestName({ id: "1" }, "Custom")).toBe("Custom");
    });

    it("resolves from config.messages.questName", () => {
        const quest: Quest = { id: "1", config: { messages: { questName: "Config Quest" } } };
        expect(getQuestName(quest)).toBe("Config Quest");
    });

    it("resolves from root messages.questName", () => {
        const quest: Quest = { id: "1", messages: { questName: "Root Quest" } };
        expect(getQuestName(quest)).toBe("Root Quest");
    });
});

describe("isVideoTask", () => {
    it("returns true for video tasks", () => {
        expect(isVideoTask("WATCH_VIDEO")).toBe(true);
        expect(isVideoTask("WATCH_VIDEO_ON_MOBILE")).toBe(true);
        expect(isVideoTask("WATCH_VIDEO_ON_DESKTOP")).toBe(true);
    });

    it("returns false for non-video tasks", () => {
        expect(isVideoTask("PLAY_ON_DESKTOP")).toBe(false);
        expect(isVideoTask("STREAM_ON_DESKTOP")).toBe(false);
        expect(isVideoTask("PLAY_ACTIVITY")).toBe(false);
        expect(isVideoTask("ACHIEVEMENT_IN_ACTIVITY")).toBe(false);
    });
});
