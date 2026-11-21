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

import { rateLimitedPost } from "../core/api";
import { findFluxDispatcher } from "../core/stores";
import { hasTimestamp } from "../core/questLogic";
import { QuestsStore } from "../core/stores";
import { getQuestName, type Quest } from "../core/types";
import { createScopedLogger } from "../foundation/core/logging";
import { notify } from "../ui/notifications";
import { settings } from "../settings";

const log = createScopedLogger("quests/consoleTracking");

const POLL_MS = 15_000;
const MAX_TIMEOUT_MS = 2 * 60 * 60_000;

export const CONSOLE_TASKS = ["PLAY_ON_XBOX", "PLAY_ON_PLAYSTATION"] as const;
export type ConsoleTask = (typeof CONSOLE_TASKS)[number];

export function isConsoleTask(task: string): task is ConsoleTask {
    return (CONSOLE_TASKS as readonly string[]).includes(task);
}

interface ActiveTracking {
    questId: string;
    controller: AbortController;
    poll: ReturnType<typeof setInterval> | null;
    timeout: ReturnType<typeof setTimeout> | null;
    startedAt: number;
}

let active: ActiveTracking | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function changed() {
    listeners.forEach((l) => {
        try {
            l();
        } catch {}
    });
}

export function subscribeConsoleState(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getActiveConsoleQuestId(): string | null {
    return active?.questId ?? null;
}

function consoleMode(): string {
    return (settings.store as { consoleQuestMode?: string }).consoleQuestMode ?? "off";
}

function getQuest(questId: string): Quest | undefined {
    try {
        return QuestsStore?.getQuest?.(questId) ?? undefined;
    } catch {
        return undefined;
    }
}

function responseHasErrors(response: unknown): boolean {
    if (!response || typeof response !== "object") return true;
    const body = (response as Record<string, unknown>).body ?? response;
    if (!body || typeof body !== "object") return true;
    const record = body as Record<string, unknown>;
    return (
        (Array.isArray(record.error_hints) && record.error_hints.length > 0) ||
        (Array.isArray(record.error_hints_v2) && record.error_hints_v2.length > 0)
    );
}

function isComplete(quest: Quest | undefined, taskName: string): boolean {
    if (!quest) return false;
    if (hasTimestamp(quest.userStatus?.completedAt)) return true;
    const target =
        quest.config?.taskConfigV2?.tasks?.[taskName]?.target ??
        quest.config?.taskConfig?.tasks?.[taskName]?.target ??
        0;
    const progress = quest.userStatus?.progress?.[taskName]?.value ?? 0;
    return target > 0 && progress >= target;
}

function responseStatus(response: unknown): Record<string, unknown> | null {
    if (!response || typeof response !== "object") return null;
    const body = (response as Record<string, unknown>).body ?? response;
    if (!body || typeof body !== "object") return null;
    return body as Record<string, unknown>;
}

async function stopTracking(questId: string, sendStop: boolean): Promise<void> {
    const tracking = active;
    if (!tracking || tracking.questId !== questId) return;
    active = null;
    if (tracking.poll) clearInterval(tracking.poll);
    if (tracking.timeout) clearTimeout(tracking.timeout);
    tracking.controller.abort();
    changed();

    if (sendStop && generation === tracking.startedAt) {
        try {
            await rateLimitedPost(
                `/quests/${questId}/console/stop`,
                {},
                () => !tracking.controller.signal.aborted && generation === tracking.startedAt,
                tracking.controller.signal
            );
        } catch (e) {
            log.warn(`Could not stop console tracking cleanly for ${questId}:`, e);
        }
    }
}

/** Starts Discord's linked-console tracking flow. Requires a real linked account + gameplay. */
export async function startConsoleTracking(questId: string): Promise<boolean> {
    if (active && active.questId !== questId) {
        notify("Console tracking busy", "Another console quest is already being tracked.", "info");
        return false;
    }
    if (active?.questId === questId) return true;

    const quest = getQuest(questId);
    if (!quest) {
        notify("Quest not found", "The console quest is no longer available.", "error");
        return false;
    }

    const taskName = Object.keys(
        quest.config?.taskConfigV2?.tasks ?? quest.config?.taskConfig?.tasks ?? {}
    ).find(isConsoleTask);
    if (!taskName) {
        notify("Unsupported quest", "This quest has no linked-console task.", "error");
        return false;
    }

    let response: unknown;
    try {
        response = await rateLimitedPost(`/quests/${questId}/console/start`, {});
        if (responseHasErrors(response)) {
            notify(
                "Console not tracking",
                `Discord could not start linked-console tracking for ${getQuestName(quest)}. Check the linked account, online presence and privacy settings.`,
                "info"
            );
            return false;
        }
    } catch (e) {
        log.warn(`Console start failed for ${questId}:`, e);
        notify(
            "Console start failed",
            "Discord rejected the linked-console start request.",
            "error"
        );
        return false;
    }

    const currentGeneration = generation;
    const controller = new AbortController();
    const tracking: ActiveTracking = {
        questId,
        controller,
        poll: null,
        timeout: null,
        startedAt: currentGeneration,
    };
    active = tracking;
    changed();

    void responseStatus(response);

    tracking.timeout = setTimeout(() => {
        void stopTracking(questId, true).then(() =>
            notify(
                "Console tracking timed out",
                `${getQuestName(quest)} was not completed in time.`,
                "info"
            )
        );
    }, MAX_TIMEOUT_MS);

    tracking.poll = setInterval(async () => {
        if (tracking.controller.signal.aborted || generation !== currentGeneration) return;
        const refreshed = getQuest(questId);
        if (isComplete(refreshed, taskName)) {
            await stopTracking(questId, true);
            notify(
                "Console quest complete",
                `${getQuestName(quest)} completed on the linked console.`,
                "success"
            );
            return;
        }
        if (!refreshed) await stopTracking(questId, false);
    }, POLL_MS);

    notify(
        "Console tracking started",
        `${getQuestName(quest)}: keep the linked console online and play the required game.`,
        "info"
    );
    return true;
}

export function stopConsoleTracking(questId?: string): void {
    const id = questId ?? active?.questId;
    if (!id) return;
    void stopTracking(id, true);
}

/** Called on account switch / reconnect so old sessions never touch a new account. */
export function resetConsoleGeneration(): void {
    generation++;
    const id = active?.questId;
    if (id) void stopTracking(id, false);
}

export function maybeAutoStartConsole(quest: Quest, taskName: string): boolean {
    if (consoleMode() !== "auto") return false;
    if (!isConsoleTask(taskName)) return false;
    void startConsoleTracking(quest.id);
    return true;
}

export function registerConsoleHeartbeat(
    listener: (questId: string, completed: boolean) => void
): () => void {
    const onHeartbeat = (data: unknown) => {
        if (!data || typeof data !== "object") return;
        const record = data as Record<string, unknown>;
        const questId = record.questId ?? record.quest_id;
        if (typeof questId !== "string" || questId !== active?.questId) return;
        const quest = getQuest(questId);
        listener(
            questId,
            isComplete(quest, "PLAY_ON_XBOX") || isComplete(quest, "PLAY_ON_PLAYSTATION")
        );
    };
    const dispatcher = findFluxDispatcher();
    dispatcher?.subscribe?.("QUESTS_SEND_HEARTBEAT_SUCCESS", onHeartbeat);
    return () => dispatcher?.unsubscribe?.("QUESTS_SEND_HEARTBEAT_SUCCESS", onHeartbeat);
}
