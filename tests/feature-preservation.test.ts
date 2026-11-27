import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
    return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Questcord feature preservation", () => {
    it("preserves plugin identity constants and DataStore keys", () => {
        const constants = source("constants.ts");
        for (const text of [
            'export const PLUGIN_VERSION = "0.1.1";',
            'export const LOG_PREFIX = "[Questcord]";',
            'export const GITHUB_REPO = "zpt0/Questcord";',
            'export const UPDATES_CHANNEL_ID = "1532348047697121340";',
            'export const SUPPORT_INVITE_CODE = "sKTrAMctcy";',
            'export const SAVED_QUESTS_KEY = "questcord-active-quests";',
            'export const QUEUE_KEY = "questcord-queue";',
            'export const QUEUE_ENABLED_KEY = "questcord-queue-enabled";',
        ]) {
            expect(constants, text).toContain(text);
        }
    });

    it("preserves owner-scoped persistence and legacy migration", () => {
        const account = source("core/account.ts");
        expect(account).toContain("`${base}:${owner}`");
        expect(account).toContain("DataStore.del(base)");
        expect(account).toContain("keyFor(base) !== key");
    });

    it("preserves token validation and enrollment semantics", () => {
        const api = source("core/api.ts");
        const manager = source("quests/manager.ts");
        expect(api).toContain('typeof token === "string" && token.length > 50');
        expect(manager).toContain('const BLACKLISTED_QUEST_ID = "1412491570820812933";');
        expect(manager).toContain("const ENROLL_LOCATIONS = [11, 2] as const;");
        expect(manager).toContain("/quests/${questId}/enroll`");
        expect(manager).toContain("export const SAVED_STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;");
        expect(source("quests/queue/order.ts")).toContain("PLAY_ON_XBOX");
        expect(source("quests/queue/order.ts")).toContain("PLAY_ON_PLAYSTATION");
    });

    it("preserves the achievement bypass security-sensitive endpoints", () => {
        const bypass = source("quests/achievementBypass.ts");
        for (const text of [
            'const RELAY_URL = "http://127.0.0.1:43210";',
            '"X-Orion-Relay": "1"',
            "`https://${applicationId}.discordsays.com/api/v1/achievements/progress`",
            "/applications/${applicationId}/proxy-tickets",
            "/users/@me/applications/${applicationId}/authorize",
            "identify%20applications.commands%20applications.entitlements&prompt=consent",
            'localStorage?.getItem("token")',
        ]) {
            expect(bypass, text).toContain(text);
        }
    });

    it("preserves UI patch class names and the Vencord popup guard", () => {
        const patches = source("ui/patches.tsx");
        expect(patches).toContain("vc-questcord-footer");
        expect(patches).toContain("vc-questcord-footer-row");
        expect(patches).toContain("$self.renderFooter");
        expect(patches).toContain("$self.renderQuestButton");
        expect(patches).toContain("$self.renderQueueButton");

        const dismiss = source("ui/questVideoDismiss.ts");
        expect(dismiss).toContain("[class*='vc-']");
        expect(dismiss).toContain("accept quest");
        expect(dismiss).toContain("ad-video-modal-close-btn");
        expect(dismiss).not.toContain("closeModal");
        expect(dismiss).not.toContain("CLOSE_SELECTOR");
    });

    it("reacts to Discord's task platform selection", () => {
        const index = source("index.tsx");
        expect(index).toContain("QUESTS_SELECT_TASK_PLATFORM(data: unknown)");
        expect(index).toContain("clearEnrollmentBlockForQuest(questId)");
        expect(index).toContain("scheduleTick(250)");
    });

    it("keeps the smart button state and one-game-one-video lane behavior", () => {
        const button = source("ui/QuestButton.tsx");
        expect(button).toContain("const running = isRunning(questId);");
        expect(button).toContain("disabled={!onClick}");
        expect(button).toContain("isLaneRunning(lane)");

        const runner = source("quests/queue/runner.ts");
        expect(runner).toContain('for (const kind of ["video", "game"] as const)');
        expect(runner).toContain("pickNextOfKind(rows, kind)");

        const manager = source("quests/manager.ts");
        const capacity = source("quests/taskCapacity.ts");
        expect(manager).toContain("export function checkTaskCapacity(");
        expect(capacity).toContain(
            'const lane: TaskLane = isVideoTask(newTaskType) ? "video" : "game";'
        );
    });

    it("preserves all ten i18n locales", () => {
        const locales = readdirSync(resolve(process.cwd(), "ui/i18n")).filter((name) =>
            name.endsWith(".ts")
        );
        expect(locales.sort()).toEqual(
            [
                "de.ts",
                "en-US.ts",
                "es.ts",
                "fr.ts",
                "it.ts",
                "ja.ts",
                "ko.ts",
                "pt.ts",
                "ru.ts",
                "types.ts",
                "zh.ts",
            ].sort()
        );
    });
});
