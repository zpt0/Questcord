/*
 * Questcord, a Vencord plugin that automates Discord Quests
 * Copyright (c) 2026 zpt0
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, expect, it } from "vitest";
import {
    assessClaimResponse,
    calculateRetryDelay,
    classifyClaimFailure,
    isRunnableTaskName,
    isSafeInternalPath,
    isTerminalQuestError,
    getEventQuestId,
    normalizeJoinOperator,
    prioritizeTaskNames,
    resolveTask,
    RUNNABLE_TASKS,
    selectClaimLocation,
    selectClaimPlatform,
} from "./questLogic";

describe("questLogic", () => {
    it("normalizes join operators safely", () => {
        expect(normalizeJoinOperator("AND")).toBe("and");
        expect(normalizeJoinOperator("or")).toBe("or");
        expect(normalizeJoinOperator(undefined)).toBe("or");
        expect(normalizeJoinOperator("xor")).toBe("unknown");
        expect(normalizeJoinOperator(1)).toBe("unknown");
    });

    it("uses capped exponential backoff", () => {
        expect(calculateRetryDelay(1, 60_000, 900_000)).toBe(60_000);
        expect(calculateRetryDelay(2, 60_000, 900_000)).toBe(120_000);
        expect(calculateRetryDelay(10, 60_000, 900_000)).toBe(900_000);
    });

    it("accepts only safe internal paths", () => {
        expect(isSafeInternalPath("/quest-home")).toBe(true);
        expect(isSafeInternalPath("//example.com/quest-home")).toBe(false);
        expect(isSafeInternalPath("https://example.com")).toBe(false);
        expect(isSafeInternalPath("/quest\\home")).toBe(false);
    });

    it("prioritizes desktop tasks when Discord selected a computer", () => {
        const ordered = prioritizeTaskNames(RUNNABLE_TASKS, "DESKTOP");
        expect(ordered.indexOf("PLAY_ON_DESKTOP")).toBeLessThan(ordered.indexOf("PLAY_ACTIVITY"));
        expect(isRunnableTaskName("PLAY_ON_DESKTOP")).toBe(true);
        expect(isRunnableTaskName("ACHIEVEMENT_IN_GAME")).toBe(false);
    });

    it("prioritizes console tasks when Discord selected a console", () => {
        const ordered = prioritizeTaskNames(RUNNABLE_TASKS, "CONSOLE");
        expect(ordered[0]).toBe("PLAY_ON_XBOX");
        expect(ordered[1]).toBe("PLAY_ON_PLAYSTATION");
    });

    it("keeps task order for unknown or missing platforms", () => {
        expect(prioritizeTaskNames(RUNNABLE_TASKS, undefined)).toEqual([...RUNNABLE_TASKS]);
        expect(prioritizeTaskNames(RUNNABLE_TASKS, "MOBILE")).toEqual([...RUNNABLE_TASKS]);
    });

    it("marks rejected quest actions as terminal", () => {
        expect(isTerminalQuestError({ status: 403 })).toBe(true);
        expect(isTerminalQuestError({ response: { status: 404 } })).toBe(true);
        expect(isTerminalQuestError({ status: 429 })).toBe(false);
        expect(isTerminalQuestError(new Error("network"))).toBe(false);
    });

    it("extracts quest ids from platform selection events", () => {
        expect(getEventQuestId({ questId: "123", taskPlatform: "CONSOLE" })).toBe("123");
        expect(getEventQuestId({ quest_id: "456" })).toBe("456");
        expect(getEventQuestId({ userStatus: { questId: "789" } })).toBe("789");
        expect(getEventQuestId({ user_status: { quest_id: "101" } })).toBe("101");
        expect(getEventQuestId({ taskPlatform: "CONSOLE" })).toBe(null);
        expect(getEventQuestId(null)).toBe(null);
    });

    it("resolves OR groups after any completed task", () => {
        const result = resolveTask(
            [
                { name: "WATCH_VIDEO", target: 30, progress: 30, runnable: true },
                { name: "PLAY_ON_XBOX", target: 600, progress: 0, runnable: true },
            ],
            "or"
        );
        expect(result.satisfied).toBe(true);
        expect(result.selected).toBeNull();
    });

    it("resolves AND groups to the next runnable task", () => {
        const result = resolveTask(
            [
                { name: "WATCH_VIDEO", target: 30, progress: 30, runnable: true },
                { name: "PLAY_ACTIVITY", target: 600, progress: 0, runnable: true },
                { name: "ACHIEVEMENT_IN_GAME", target: 1, progress: 0, runnable: false },
            ],
            "and"
        );
        expect(result.selected?.name).toBe("PLAY_ACTIVITY");
        expect(result.incompleteUnsupported).toEqual(["ACHIEVEMENT_IN_GAME"]);
    });

    it("fails closed on unknown join operators", () => {
        const result = resolveTask(
            [{ name: "WATCH_VIDEO", target: 30, progress: 0, runnable: true }],
            "unknown"
        );
        expect(result.selected).toBeNull();
        expect(result.satisfied).toBe(false);
    });

    it("selects claim platforms like Discord's reward modal", () => {
        expect(selectClaimPlatform([4], [{ type: 1 }])).toEqual({ kind: "selected", platform: 0 });
        expect(selectClaimPlatform([2, 1, 2], [{ type: 2 }])).toEqual({
            kind: "selected",
            platform: 2,
        });
        expect(selectClaimPlatform(["4"], [{ type: 2 }])).toEqual({ kind: "invalid" });
        expect(selectClaimLocation([{ type: 1 }])).toBe(25);
        expect(selectClaimLocation([{ type: 3 }])).toBe(11);
    });

    it("assesses claim responses", () => {
        expect(assessClaimResponse({ status: 200, body: { errors: [] } })).toEqual({
            kind: "pending",
        });
        expect(
            assessClaimResponse({ status: 200, body: { errors: [], claimed_at: "2026-01-01" } })
        ).toEqual({ kind: "success" });
        expect(assessClaimResponse({ status: 200, body: { errors: [{}] } })).toEqual({
            kind: "rewardErrors",
        });
        expect(assessClaimResponse({ status: 500, body: { errors: [] } })).toEqual({
            kind: "invalid",
        });
    });

    it("classifies claim failures without reading challenge values", () => {
        expect(classifyClaimFailure({ status: 400, body: { captcha_key: ["secret"] } }).kind).toBe(
            "captcha"
        );
        expect(classifyClaimFailure({ status: 409, body: { code: 260010 } }).kind).toBe(
            "alreadyClaimed"
        );
        expect(classifyClaimFailure({ status: 429 }).kind).toBe("transient");
        expect(classifyClaimFailure({ status: 403 }).kind).toBe("terminal");
        const cancelled = new Error("cancelled");
        cancelled.name = "CaptchaCancelError";
        expect(classifyClaimFailure(cancelled).kind).toBe("captcha");
    });
});
