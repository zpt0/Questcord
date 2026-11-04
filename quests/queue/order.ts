/*!
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
    ALL_TASK_TYPES,
    getQuestName,
    getTaskConfig,
    isVideoTask,
    type Quest,
    type TaskType,
} from "../../core/types";

export const CONSOLE_ONLY_KEYS = new Set(["PLAY_ON_XBOX", "PLAY_ON_PLAYSTATION"]);

export function isConsoleOnly(keys: string[]): boolean {
    return keys.length > 0 && keys.every(key => CONSOLE_ONLY_KEYS.has(key));
}

export interface QueueEntry {
    questId: string;
    addedAt: number;
}

export type QueueKind = "video" | "game";
export type RowState = "running" | "ready" | "needs-accept" | "unavailable";

export interface QueueRow {
    entry: QueueEntry;
    quest: Quest | undefined;
    task: TaskType | null;
    kind: QueueKind | null;
    state: RowState;
}

export const kindOf = (task: TaskType): QueueKind => (isVideoTask(task) ? "video" : "game");

export function pickTask(quest: Quest): TaskType | null {
    const cfg = getTaskConfig(quest);
    if (!cfg?.tasks) return null;
    const keys = Object.keys(cfg.tasks);
    if (isConsoleOnly(keys)) return null;
    // first type that exists wins; ALL_TASK_TYPES order sets the priority
    return ALL_TASK_TYPES.find((t) => cfg.tasks[t] != null) ?? null;
}

export function isCompleted(quest: Quest): boolean {
    return !!quest.userStatus?.completedAt;
}

export function isEnrolled(quest: Quest): boolean {
    return !!quest.userStatus?.enrolledAt;
}

export function isExpired(quest: Quest, now = Date.now()): boolean {
    const expiresAt = quest.config?.expiresAt ?? quest.expiresAt;
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() <= now;
}

export function isQueueable(quest: Quest | undefined, now = Date.now()): boolean {
    if (!quest?.id) return false;
    const task = pickTask(quest);
    return task != null && !isCompleted(quest) && !isExpired(quest, now);
}

export function describeEntry(
    entry: QueueEntry,
    quest: Quest | undefined,
    running: boolean,
    now = Date.now()
): QueueRow {
    const task = quest ? pickTask(quest) : null;
    const kind = task ? kindOf(task) : null;
    let state: RowState;
    if (running) state = "running";
    else if (!quest || !task || isCompleted(quest) || isExpired(quest, now)) state = "unavailable";
    else if (!isEnrolled(quest)) state = "needs-accept";
    else state = "ready";
    return { entry, quest, task, kind, state };
}

/**
 * Sorts rows so running quests appear first, then alternates video/game
 * round-robin by insertion order. No preference — one video, one game, one video, …
 */
export function sortRows(rows: readonly QueueRow[]): QueueRow[] {
    const array = [...rows];
    const running: QueueRow[] = [];
    const videos: QueueRow[] = [];
    const games: QueueRow[] = [];
    const other: QueueRow[] = [];

    for (const row of array) {
        if (row.state === "running") running.push(row);
        else if (row.kind === "video") videos.push(row);
        else if (row.kind === "game") games.push(row);
        else other.push(row);
    }

    // sort each bucket by insertion order
    const byAdded = (a: QueueRow, b: QueueRow) => a.entry.addedAt - b.entry.addedAt;
    videos.sort(byAdded);
    games.sort(byAdded);
    other.sort(byAdded);

    // alternate video and game, starting with video
    const alternated: QueueRow[] = [];
    let vi = 0,
        gi = 0;
    while (vi < videos.length || gi < games.length) {
        if (vi < videos.length) alternated.push(videos[vi++]);
        if (gi < games.length) alternated.push(games[gi++]);
    }

    return [...running, ...alternated, ...other];
}

export function pickNext(rows: readonly QueueRow[]): QueueRow | undefined {
    return sortRows(rows.filter((r) => r.state === "ready"))[0];
}

export function pickToAccept(rows: readonly QueueRow[]): QueueRow | undefined {
    return sortRows(rows.filter((r) => r.state === "needs-accept"))[0];
}

export { getQuestName };
