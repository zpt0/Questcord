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

export const COMPANION_EVENT_CODES = {
    TASK_STARTED: "TASK_STARTED",
    TASK_COMPLETED: "TASK_COMPLETED",
    TASK_FAILED: "TASK_FAILED",
    TASK_PAUSED: "TASK_PAUSED",
    TASK_RESUMED: "TASK_RESUMED",
    HEARTBEAT_SUCCESS: "HEARTBEAT_SUCCESS",
    HEARTBEAT_FAILURE: "HEARTBEAT_FAILURE",
    HEARTBEAT_GIVE_UP: "HEARTBEAT_GIVE_UP",
    NETWORK_RETRY: "NETWORK_RETRY",
    NETWORK_FAILED: "NETWORK_FAILED",
    BYPASS_STARTED: "BYPASS_STARTED",
    BYPASS_SUCCEEDED: "BYPASS_SUCCEEDED",
    BYPASS_FAILED: "BYPASS_FAILED",
    ACHIEVEMENT_FALLBACK: "ACHIEVEMENT_FALLBACK",
    ENROLLMENT_SUCCESS: "ENROLLMENT_SUCCESS",
    QUEST_CLAIMED: "QUEST_CLAIMED",
    ENGINE_STARTED: "ENGINE_STARTED",
    ENGINE_STOPPED: "ENGINE_STOPPED",
    ACCOUNT_SWITCHED: "ACCOUNT_SWITCHED",
} as const;

export type CompanionEventCode = (typeof COMPANION_EVENT_CODES)[keyof typeof COMPANION_EVENT_CODES];

export interface CompanionEventFailure {
    terminal: boolean;
    retryable: boolean;
    attempt: number | null;
    maxAttempts: number | null;
    httpStatus: number | null;
    upstreamCode: string | number | null;
    reason: string | null;
}

export interface CompanionEvent {
    code: CompanionEventCode;
    category: "task" | "network" | "achievement" | "bypass" | "engine" | "account";
    level: "info" | "warning" | "error" | "success";
    message: string;
    questId?: string;
    questName?: string;
    taskType?: string;
    reason?: string;
    failure?: CompanionEventFailure;
}

type Listener = (event: CompanionEvent) => void;

const listeners = new Set<Listener>();

export function emitCompanionEvent(event: CompanionEvent): void {
    for (const listener of Array.from(listeners)) {
        try {
            listener(event);
        } catch (e) {
            console.error("[Questcord] Companion event listener threw:", e);
        }
    }
}

export function subscribeCompanionEvents(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function companionFailure(partial: Partial<CompanionEventFailure>): CompanionEventFailure {
    return {
        terminal: partial.terminal ?? true,
        retryable: partial.retryable ?? false,
        attempt: partial.attempt ?? null,
        maxAttempts: partial.maxAttempts ?? null,
        httpStatus: partial.httpStatus ?? null,
        upstreamCode: partial.upstreamCode ?? null,
        reason: partial.reason ?? null,
    };
}
