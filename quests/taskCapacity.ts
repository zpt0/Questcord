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

import { isVideoTask } from "../core/types";

export type TaskLane = "game" | "video";

export interface RunningTaskView {
    readonly questId: string;
    readonly taskType: string;
}

export interface TaskCapacityResult {
    readonly canRun: boolean;
    readonly conflictQuestId: string | null;
}

/**
 * Discord allows one game and one video at a time. Video can theoretically run
 * in parallel with more videos, but this build defaults to one per lane.
 */
export function checkTaskCapacity(
    newTaskType: string,
    running: readonly RunningTaskView[],
    limits: { readonly game: number; readonly video: number }
): TaskCapacityResult {
    const lane: TaskLane = isVideoTask(newTaskType) ? "video" : "game";
    const limit = Math.max(1, Number.isFinite(limits[lane]) ? limits[lane] : 1);
    const sameLane = running.filter(
        (task) => (isVideoTask(task.taskType) ? "video" : "game") === lane
    );
    if (sameLane.length < limit) return { canRun: true, conflictQuestId: null };
    return { canRun: false, conflictQuestId: sameLane[0]?.questId ?? null };
}
