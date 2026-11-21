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

import { Quest, getQuestName, TaskType, resolveApplicationId } from "../core/types";
import { QuestsStore } from "../core/stores";
import { isConsoleOnly, CONSOLE_ONLY_KEYS } from "./queue/order";
import { pickExecutable } from "../core/utils";
import { settings } from "../settings";
import {
    type JoinOperator,
    normalizeJoinOperator,
    prioritizeTaskNames,
    resolveTask,
    RUNNABLE_TASKS,
    type TaskCandidate,
} from "../core/questLogic";

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

/** Discord exposes the platform picked in the quest modal through the live store. */
function selectedTaskPlatform(quest: Quest): unknown {
    try {
        return QuestsStore?.selectedTaskPlatform?.(quest.id) ?? null;
    } catch {
        return null;
    }
}

/** Runnable keys first (respecting the selected platform), then unknown/server-bound keys. */
function orderedTaskEntries(
    entries: Array<[string, any]>,
    selectedPlatform?: unknown
): Array<[string, any]> {
    const names = entries.map(([key]) => key);
    const orderedNames = [
        ...prioritizeTaskNames(RUNNABLE_TASKS, selectedPlatform),
        ...names.filter((name) => !(RUNNABLE_TASKS as readonly string[]).includes(name)),
    ];
    const byName = new Map(entries);
    return orderedNames.flatMap((name) => {
        const task = byName.get(name);
        return task === undefined ? [] : [[name, task] as [string, any]];
    });
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
 * Known task families. Matching now follows the ordered key list, so Discord's
 * selected platform decides between PLAY_ON_DESKTOP and PLAY_ACTIVITY.
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
    for (const key of keys) {
        if (CONSOLE_ONLY_KEYS.has(key)) continue;
        const rule = TASK_FAMILY_ORDER.find((candidate) => candidate.match(key));
        if (!rule) continue;

        // Prefer the canonical key (e.g. WATCH_VIDEO over WATCH_VIDEO_ON_MOBILE)
        // when both are present, but keep the ordered key on ties.
        if (rule.prefer?.length) {
            const preferred = rule.prefer.find(
                (candidate) => keys.includes(candidate) && !CONSOLE_ONLY_KEYS.has(candidate)
            );
            if (preferred && preferred !== key) continue;
        }
        return { type: rule.type, keyName: key };
    }
    return undefined;
}

function appIdFor(cfg: any, keyName: string, legacyAppId?: string | null): string | null {
    const task = cfg?.tasks?.[keyName];
    return task?.applications?.[0]?.id ?? legacyAppId ?? null;
}

export function detectTaskType(
    config: any,
    applicationId?: string | null,
    selectedPlatform?: unknown
): DetectedTask | null {
    const entries = taskEntries(config?.tasks);
    const keys = orderedTaskEntries(entries, selectedPlatform).map(([key]) => key);
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

export interface ResolvedTask {
    type: TaskType;
    keyName: string;
    target: number;
    joinOperator: JoinOperator;
    unsupported: string[];
}

/**
 * AND/OR-aware task resolution. Falls back to the original single-task detection
 * when the quest config has no explicit join operator.
 */
export function resolveQuestTask(
    quest: Quest,
    isDesktop: boolean,
    selectedPlatform?: unknown
): ResolvedTask | null {
    const config = selectQuestTaskConfig(quest.config ?? quest);
    if (!config) return null;
    const rawEntries = taskEntries(config?.tasks);
    if (rawEntries.length === 0) return null;
    const platform = selectedPlatform ?? selectedTaskPlatform(quest);
    const entries = orderedTaskEntries(rawEntries, platform);

    const rawJoin = (config as any).joinOperator ?? (config as any).join_operator;
    const joinOperator = normalizeJoinOperator(rawJoin);
    if (joinOperator === "unknown") return null;

    const status = quest.userStatus;
    const candidates: TaskCandidate[] = entries
        .map(([key, task]) => {
            const detected = detectTaskType(
                { tasks: { [key]: task } },
                resolveApplicationId(quest),
                platform
            );
            const needsDesktop = key.startsWith("PLAY_ON_DESKTOP") || key.startsWith("STREAM");
            const runnable =
                !!detected &&
                (!isConsoleOnly([key]) || consoleTrackingEnabled()) &&
                (!needsDesktop || isDesktop);
            return {
                name: key,
                target: typeof task?.target === "number" ? task.target : 0,
                progress: Math.max(0, status?.progress?.[key]?.value ?? 0),
                runnable,
            };
        })
        .filter((candidate) => candidate.target > 0);

    const resolution = resolveTask(candidates, joinOperator);
    if (!resolution.selected) return null;
    const detected = detectTaskType(
        {
            tasks: {
                [resolution.selected.name]: entries.find(
                    ([k]) => k === resolution.selected!.name
                )?.[1],
            },
        },
        resolveApplicationId(quest),
        platform
    );
    if (!detected) return null;

    return {
        type: detected.type,
        keyName: resolution.selected.name,
        target: resolution.selected.target,
        joinOperator,
        unsupported: resolution.incompleteUnsupported,
    };
}

function consoleTrackingEnabled(): boolean {
    try {
        return (settings.store as { consoleQuestMode?: string }).consoleQuestMode !== "off";
    } catch {
        return false;
    }
}

export function assessQuestRunnability(quest: Quest, isDesktop: boolean): QuestRunnability {
    const config = selectQuestTaskConfig(quest.config ?? quest);
    const entries = taskEntries(config?.tasks);
    const keys = entries.map(([k]) => k);
    const appId = resolveApplicationId(quest);
    const platform = selectedTaskPlatform(quest);
    let detected = detectTaskType(config, appId, platform);

    if ((settings.store as { autoResolveTasks?: boolean }).autoResolveTasks !== false) {
        const resolved = resolveQuestTask(quest, isDesktop, platform);
        if (resolved) {
            detected = {
                type: resolved.type,
                keyName: resolved.keyName,
                target: resolved.target,
                appId: appIdFor(config, resolved.keyName, appId),
            };
        }
    }

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
