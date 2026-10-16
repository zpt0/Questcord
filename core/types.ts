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

export interface TaskConfig {
    tasks: Record<string, { target: number }>;
}

export interface QuestProgress {
    [taskType: string]: { value: number };
}

export interface Quest {
    id: string;
    config?: {
        application?: { id?: string; name?: string };
        applicationId?: string;
        application_id?: string;
        applicationName?: string;
        expiresAt?: string;
        messages?: { questName?: string };
        taskConfig?: TaskConfig;
        taskConfigV2?: TaskConfig;
        configVersion?: number;
    };
    taskConfig?: TaskConfig;
    taskConfigV2?: TaskConfig;
    application?: { id?: string; name?: string };
    applicationId?: string;
    application_id?: string;
    applicationName?: string;
    messages?: { questName?: string };
    expiresAt?: string;
    userStatus?: {
        enrolledAt?: string;
        completedAt?: string;
        progress?: QuestProgress;
        streamProgressSeconds?: number;
    };
}

export interface QuestData {
    questId: string;
    userId: string;
    taskType: string;
    isProcessing: boolean;
    timeoutIds: number[];
    intervalIds: number[];
    lastProgress: number;
    targetProgress: number;
    lastProgressAt: number;
    stallWarned: boolean;
}

export interface SavedQuestState {
    questId: string;
    taskType: string;
    startedAt: number;
}

export interface AppData {
    name?: string;
    executables?: Array<{ os: string; name: string }>;
}

export const QUEST_TASK_TYPES = {
    VIDEO: ["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE", "WATCH_VIDEO_ON_DESKTOP"] as const,
    PLAY: ["PLAY_ON_DESKTOP"] as const,
    STREAM: ["STREAM_ON_DESKTOP"] as const,
    ACTIVITY: ["PLAY_ACTIVITY", "ACHIEVEMENT_IN_ACTIVITY"] as const,
};

export const ALL_TASK_TYPES = [
    ...QUEST_TASK_TYPES.VIDEO,
    ...QUEST_TASK_TYPES.PLAY,
    ...QUEST_TASK_TYPES.STREAM,
    ...QUEST_TASK_TYPES.ACTIVITY,
] as const;

export type TaskType = (typeof ALL_TASK_TYPES)[number];

export function isVideoTask(taskType: string): boolean {
    return (QUEST_TASK_TYPES.VIDEO as readonly string[]).includes(taskType);
}

export function getTaskConfig(quest: Quest): TaskConfig | null {
    // discord moved the task config between quest versions; check every known location
    return (
        quest.config?.taskConfig ??
        quest.config?.taskConfigV2 ??
        quest.taskConfig ??
        quest.taskConfigV2 ??
        null
    );
}

export function resolveApplicationId(quest: Quest): string | null {
    return (
        quest.config?.application?.id ??
        quest.config?.applicationId ??
        quest.config?.application_id ??
        quest.application?.id ??
        quest.applicationId ??
        quest.application_id ??
        null
    );
}

export function resolveApplicationName(quest: Quest): string {
    return (
        quest.config?.application?.name ??
        quest.config?.applicationName ??
        quest.application?.name ??
        quest.applicationName ??
        "Unknown App"
    );
}

export function getQuestName(quest: Quest, fallback = "Quest"): string {
    return quest.config?.messages?.questName ?? quest.messages?.questName ?? fallback;
}
