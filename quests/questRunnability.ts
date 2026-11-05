/*
 * Questcord, a Vencord plugin that automates Discord Quests
 * Copyright (c) 2026 zpt0
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {
    Quest,
    getTaskConfig,
    getQuestName,
    TaskType,
    resolveApplicationId,
    resolveApplicationName,
} from "../core/types";
import { isConsoleOnly, CONSOLE_ONLY_KEYS } from "./queue/order";
import { pickExecutable } from "../core/utils";
import { settings } from "../settings";

function taskEntries(tasks: unknown): Array<[string, any]> {
    if (!tasks) return [];
    if (tasks instanceof Map) return Array.from(tasks.entries()) as Array<[string, any]>;
    if (typeof tasks === "object") return Object.entries(tasks as Record<string, any>);
    return [];
}

function selectQuestTaskConfig(config: any): any | null {
    const current = config?.taskConfigV2;
    if (taskEntries(current?.tasks).length > 0) return current;

    const legacy = config?.taskConfig;
    if (taskEntries(legacy?.tasks).length > 0) return legacy;

    return current ?? legacy ?? null;
}

export interface QuestRunnability {
    name: string;
    hasTaskConfig: boolean;
    keys: string[];
    detected: DetectedTask | null;
    isDesktop: boolean;
}

export interface DetectedTask {
    type: TaskType;
    keyName: string;
    target: number;
    appId: string | null;
}

export const UNAUTOMATABLE_KEYS = new Map<string, string>([
    [
        "ACHIEVEMENT_IN_GAME",
        "That needs the game linked to your account and an achievement earned inside the game itself, which nothing running in Discord can do for you.",
    ],
]);

export interface TaskFamilyRule {
    match: (key: string) => boolean;
    type: TaskType;
    prefer?: string[];
}

/**
 * Task family priority: ACHIEVEMENT_IN_ACTIVITY > PLAY_ACTIVITY > VIDEO > PLAY_ON_DESKTOP > STREAM.
 */
export const TASK_FAMILY_ORDER: TaskFamilyRule[] = [
    { match: (key) => key === "ACHIEVEMENT_IN_ACTIVITY", type: "ACHIEVEMENT_IN_ACTIVITY" },
    { match: (key) => key === "PLAY_ACTIVITY", type: "PLAY_ACTIVITY" },
    { match: (key) => key.includes("VIDEO"), type: "WATCH_VIDEO", prefer: ["WATCH_VIDEO"] },
    {
        match: (key) => key.startsWith("PLAY"),
        type: "PLAY_ON_DESKTOP",
        prefer: ["PLAY_ON_DESKTOP"],
    },
    {
        match: (key) => key.startsWith("STREAM"),
        type: "STREAM_ON_DESKTOP",
        prefer: ["STREAM_ON_DESKTOP"],
    },
    { match: (key) => key.includes("ACTIVITY"), type: "PLAY_ACTIVITY" },
];

export function selectTaskFamily(keys: string[]): { type: TaskType; keyName: string } | undefined {
    for (const rule of TASK_FAMILY_ORDER) {
        const exact = rule.prefer ? keys.find((key) => rule.prefer!.includes(key)) : undefined;
        if (exact) return { type: rule.type, keyName: exact };
        const match = keys.find((key) => rule.match(key) && !CONSOLE_ONLY_KEYS.has(key));
        if (match) return { type: rule.type, keyName: match };
    }
    return undefined;
}

function appIdFor(cfg: any, keyName: string, legacyAppId?: string | null): string | null {
    const task = cfg?.tasks?.[keyName];
    return task?.applications?.[0]?.id ?? legacyAppId ?? null;
}

export function detectTaskType(config: any, applicationId?: string | null): DetectedTask | null {
    const entries = taskEntries(config?.tasks);
    const keys = entries.map(([k]) => k);
    const family = selectTaskFamily(keys);
    if (family) {
        const task = entries.find(([k]) => k === family.keyName)?.[1];
        return {
            type: family.type,
            keyName: family.keyName,
            target: task?.target ?? 0,
            appId: appIdFor(config, family.keyName, applicationId),
        };
    }

    if (isConsoleOnly(keys)) return null;

    if (applicationId && entries.length > 0) {
        return {
            type: "PLAY_ON_DESKTOP",
            keyName: "PLAY_ON_DESKTOP",
            target: entries[0][1]?.target ?? 0,
            appId: applicationId,
        };
    }
    return null;
}

export function assessQuestRunnability(quest: Quest, isDesktop: boolean): QuestRunnability {
    const config = selectQuestTaskConfig(quest.config ?? quest);
    const entries = taskEntries(config?.tasks);
    const keys = entries.map(([k]) => k);
    const detected = detectTaskType(config, resolveApplicationId(quest));
    return {
        name: getQuestName(quest),
        hasTaskConfig: entries.length > 0,
        keys,
        detected,
        isDesktop,
    };
}

export function questBlocker(q: QuestRunnability): string | null {
    if (!q.hasTaskConfig)
        return `"${q.name}" has no usable task config, so there is nothing to drive.`;

    if (!q.detected) {
        if (!q.keys.length)
            return `"${q.name}" lists no tasks at all, so there is nothing to drive.`;
        if (isConsoleOnly(q.keys))
            return `"${q.name}" is console-only (${q.keys.join(", ")}), so no desktop client can run it.`;

        const named = q.keys.find((key) => UNAUTOMATABLE_KEYS.has(key));
        if (named) {
            return q.keys.length === 1
                ? `"${q.name}" offers only ${named}. ${UNAUTOMATABLE_KEYS.get(named)}`
                : `"${q.name}" offers ${q.keys.join(", ")}, and none of them run here. The one we know about is ${named}. ${UNAUTOMATABLE_KEYS.get(named)}`;
        }

        return `"${q.name}" uses an unsupported task type (${q.keys.join(", ")}).`;
    }

    const { type, target, appId } = q.detected;

    if (!q.isDesktop && (type === "PLAY_ON_DESKTOP" || type === "STREAM_ON_DESKTOP")) {
        return `"${q.name}" needs the desktop app for its ${type} task.`;
    }
    if (target <= 0) return `"${q.name}" has an invalid target (${target}).`;
    if ((type === "PLAY_ON_DESKTOP" || type === "STREAM_ON_DESKTOP") && !appId) {
        return `"${q.name}" has no application id in its config, so the game cannot be spoofed.`;
    }

    return null;
}

export type QuestOutcome = "completed" | "blocked" | "failed" | "filtered";

export function recordOutcome(
    outcomes: Map<string, QuestOutcome>,
    id: string,
    outcome: QuestOutcome
): void {
    if (outcomes.get(id) === "completed") return;
    outcomes.set(id, outcome);
}

export interface RunSummary {
    finished: number;
    blocked: number;
    filtered: number;
    failed: number;
    line: string;
    playDone: boolean;
}

export function summarizeRun(outcomes: Map<string, QuestOutcome>): RunSummary {
    let finished = 0,
        blocked = 0,
        filtered = 0,
        failed = 0;
    for (const outcome of outcomes.values()) {
        if (outcome === "completed") finished++;
        else if (outcome === "blocked") blocked++;
        else if (outcome === "filtered") filtered++;
        else failed++;
    }

    if (!blocked && !filtered && !failed) {
        return {
            finished,
            blocked,
            filtered,
            failed,
            line: "All available quests are completed!",
            playDone: true,
        };
    }

    const parts: string[] = [];
    if (finished) parts.push(`${finished} quest(s) finished`);
    if (blocked) parts.push(`${blocked} skipped because this client cannot drive them`);
    if (filtered) parts.push(`${filtered} left out because they pay no Orbs`);
    if (failed) parts.push(`${failed} failed`);
    return {
        finished,
        blocked,
        filtered,
        failed,
        line: `Nothing left to run. ${parts.join(", ")}.`,
        playDone: finished > 0,
    };
}

export function summarizeSharedGameQuests(
    tasks: ReadonlyArray<{ appId: string | number; name: string; type: string }>
): string[] {
    const groups = new Map<string, { name: string; count: number }>();
    for (const t of tasks) {
        if (t.type !== "PLAY_ON_DESKTOP") continue;
        const key = String(t.appId ?? "");
        if (!key || key === "0") continue;
        const g = groups.get(key);
        if (g) g.count++;
        else groups.set(key, { name: t.name, count: 1 });
    }

    const lines: string[] = [];
    for (const { name, count } of groups.values()) {
        if (count < 2) continue;
        lines.push(
            `${count} "${name}" quests are the same game, so Discord credits all ${count} while it runs once and they finish together. The limit still drives one at a time.`
        );
    }
    return lines;
}

export function isQuestExpired(questStore: any, q: Quest): boolean {
    if (typeof questStore?.isQuestExpired === "function") {
        try {
            return questStore.isQuestExpired(q.id) === true;
        } catch {
            /* fall through to the timestamp */
        }
    }
    const ends = new Date(q.config?.expiresAt ?? NaN).getTime();
    return !isNaN(ends) && ends <= Date.now();
}

export { pickExecutable };
