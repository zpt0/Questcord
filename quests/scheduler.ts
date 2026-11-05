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

import type { TaskType } from "../core/types";
import { settings } from "../settings";

export type SchedulerLane = "game" | "video";
export type SchedulerQuestState = "running" | "waiting";

export function schedulerLaneForTaskType(taskType: TaskType): SchedulerLane {
    return taskType === "WATCH_VIDEO" ||
        taskType === "WATCH_VIDEO_ON_MOBILE" ||
        taskType === "WATCH_VIDEO_ON_DESKTOP"
        ? "video"
        : "game";
}

export interface SchedulerTaskView {
    questId: string;
    lane: SchedulerLane;
    active: boolean;
    started: boolean;
}

export interface SchedulerLaneSnapshot {
    readonly limit: number | null;
    readonly running: number;
    readonly waiting: number;
}

export interface SchedulerQuestSnapshot {
    readonly lane: SchedulerLane;
    readonly state: SchedulerQuestState;
}

export interface SchedulerSnapshot {
    readonly lanes: Readonly<Record<SchedulerLane, SchedulerLaneSnapshot>>;
    readonly quests: Readonly<Record<string, SchedulerQuestSnapshot>>;
}

type LaneRuntime = {
    token: number | null;
    limit: number | null;
};

function idleLane(): LaneRuntime {
    return { token: null, limit: null };
}

export class SchedulerMetadata {
    private nextToken = 0;
    private readonly lanes: Record<SchedulerLane, LaneRuntime> = {
        game: idleLane(),
        video: idleLane(),
    };
    private readonly listeners = new Set<() => void>();
    private deliveryQueued = false;

    beginLane(lane: SchedulerLane, limit: number): number {
        const token = ++this.nextToken;
        this.lanes[lane] = { token, limit: Math.max(1, limit) };
        this.emit();
        return token;
    }

    endLane(lane: SchedulerLane, token: number): void {
        if (this.lanes[lane].token !== token) return;
        this.lanes[lane] = idleLane();
        this.emit();
    }

    clear(): void {
        const changed = this.lanes.game.token != null || this.lanes.video.token != null;
        this.lanes.game = idleLane();
        this.lanes.video = idleLane();
        if (changed) this.emit();
    }

    notify(): void {
        if (this.lanes.game.token == null && this.lanes.video.token == null) return;
        this.emit();
    }

    snapshot(tasks: Iterable<SchedulerTaskView>): SchedulerSnapshot {
        const game = { limit: this.lanes.game.limit, running: 0, waiting: 0 };
        const video = { limit: this.lanes.video.limit, running: 0, waiting: 0 };
        const quests: Record<string, SchedulerQuestSnapshot> = {};

        for (const task of tasks) {
            if (!task.active || this.lanes[task.lane].token == null || quests[task.questId])
                continue;
            const state: SchedulerQuestState = task.started ? "running" : "waiting";
            quests[task.questId] = Object.freeze({ lane: task.lane, state });
            const lane = task.lane === "game" ? game : video;
            if (state === "running") lane.running++;
            else lane.waiting++;
        }

        return Object.freeze({
            lanes: Object.freeze({
                game: Object.freeze(game),
                video: Object.freeze(video),
            }),
            quests: Object.freeze(quests),
        });
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            this.listeners.delete(listener);
        };
    }

    private emit(): void {
        if (this.deliveryQueued) return;
        this.deliveryQueued = true;
        queueMicrotask(() => {
            this.deliveryQueued = false;
            for (const listener of Array.from(this.listeners)) {
                try {
                    listener();
                } catch (error) {
                    console.error("[Questcord] Scheduler-state listener threw:", error);
                }
            }
        });
    }
}

export const schedulerMetadata = new SchedulerMetadata();

export class Scheduler {
    private readonly gameLimit: number;
    private readonly videoLimit: number;
    private readonly taskViews = new Map<string, SchedulerTaskView>();
    private gameToken: number | null = null;
    private videoToken: number | null = null;

    constructor() {
        this.gameLimit = (settings.store as { gameConcurrency?: number }).gameConcurrency ?? 1;
        this.videoLimit = (settings.store as { videoConcurrency?: number }).videoConcurrency ?? 2;
    }

    getGameLimit(): number {
        return this.gameLimit;
    }

    getVideoLimit(): number {
        return this.videoLimit;
    }

    registerTask(questId: string, taskType: TaskType): void {
        const lane = schedulerLaneForTaskType(taskType);
        this.taskViews.set(questId, {
            questId,
            lane,
            active: true,
            started: false,
        });
    }

    unregisterTask(questId: string): void {
        const view = this.taskViews.get(questId);
        if (!view) return;

        if (view.started) {
            this.decrementRunning(view.lane);
        }
        this.taskViews.delete(questId);
        schedulerMetadata.notify();
    }

    markStarted(questId: string): void {
        const view = this.taskViews.get(questId);
        if (!view) return;
        view.started = true;
        this.incrementRunning(view.lane);
        schedulerMetadata.notify();
    }

    private incrementRunning(lane: SchedulerLane): void {
        schedulerMetadata.notify();
    }

    private decrementRunning(lane: SchedulerLane): void {
        schedulerMetadata.notify();
    }

    canStart(lane: SchedulerLane): boolean {
        const limit = lane === "game" ? this.gameLimit : this.videoLimit;
        const running = this.countRunning(lane);
        return running < limit;
    }

    countRunning(lane: SchedulerLane): number {
        let count = 0;
        for (const view of this.taskViews.values()) {
            if (view.lane === lane && view.active && view.started) count++;
        }
        return count;
    }

    countWaiting(lane: SchedulerLane): number {
        let count = 0;
        for (const view of this.taskViews.values()) {
            if (view.lane === lane && view.active && !view.started) count++;
        }
        return count;
    }

    getSnapshot(): SchedulerSnapshot {
        return schedulerMetadata.snapshot(this.taskViews.values());
    }

    beginLane(lane: SchedulerLane): number {
        const limit = lane === "game" ? this.gameLimit : this.videoLimit;
        if (lane === "game") {
            this.gameToken = schedulerMetadata.beginLane("game", limit);
            return this.gameToken;
        } else {
            this.videoToken = schedulerMetadata.beginLane("video", limit);
            return this.videoToken;
        }
    }

    endLane(lane: SchedulerLane): void {
        if (lane === "game" && this.gameToken != null) {
            schedulerMetadata.endLane("game", this.gameToken);
            this.gameToken = null;
        } else if (lane === "video" && this.videoToken != null) {
            schedulerMetadata.endLane("video", this.videoToken);
            this.videoToken = null;
        }
    }

    clear(): void {
        schedulerMetadata.clear();
        this.gameToken = null;
        this.videoToken = null;
    }

    getRunnableTasks(
        allTasks: Iterable<{ questId: string; taskType: TaskType }>
    ): Array<{ questId: string; taskType: TaskType }> {
        const result: Array<{ questId: string; taskType: TaskType }> = [];
        const gameTasks: Array<{ questId: string; taskType: TaskType }> = [];
        const videoTasks: Array<{ questId: string; taskType: TaskType }> = [];

        for (const task of allTasks) {
            const lane = schedulerLaneForTaskType(task.taskType);
            if (lane === "game") gameTasks.push(task);
            else videoTasks.push(task);
        }

        // Round-robin: alternate game and video
        let gi = 0,
            vi = 0;
        while (gi < gameTasks.length || vi < videoTasks.length) {
            if (gi < gameTasks.length) result.push(gameTasks[gi++]);
            if (vi < videoTasks.length) result.push(videoTasks[vi++]);
        }

        return result;
    }
}

let schedulerInstance: Scheduler | null = null;

export function getScheduler(): Scheduler {
    if (!schedulerInstance) {
        schedulerInstance = new Scheduler();
    }
    return schedulerInstance;
}
