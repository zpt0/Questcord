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

import { findByPropsLazy } from "@webpack";
import { LOG_PREFIX } from "../constants";
import { Traffic } from "./traffic";
import { debugLog } from "./state";
import { API } from "./stores";

const AuthStore = findByPropsLazy("getToken");
export function getDiscordToken(): string {
    try {
        const token = AuthStore?.getToken?.();
        if (typeof token === "string" && token.length > 50) {
            return token;
        }
    } catch (e) {
        console.error(`${LOG_PREFIX} Token error:`, e);
    }
    console.error(`${LOG_PREFIX} Failed to get Discord token`);
    return "";
}

interface ApiError extends Error {
    status?: number;
    body?: string;
    retryAfter?: number;
}

let trafficInstance: Traffic | null = null;
let isEngineRunning = false;

export function setTrafficEngineRunning(running: boolean): void {
    isEngineRunning = running;
}

export function getTrafficInstance(): Traffic | null {
    return trafficInstance;
}

export function initializeTraffic(API: any): Traffic {
    if (!trafficInstance) {
        trafficInstance = new Traffic(API, () => isEngineRunning);
    }
    return trafficInstance;
}

export async function discordApiGet(endpoint: string): Promise<any> {
    if (!API?.get) throw new Error("Internal API not available");
    try {
        return await API.get({ url: `/api/v9${endpoint}` });
    } catch (e: any) {
        const error: ApiError = new Error(`API GET failed: ${e.message}`);
        error.status = e.status;
        if (e.status === 429) {
            const retryAfter = parseRetryAfterMs(e);
            if (retryAfter != null) error.retryAfter = retryAfter;
        }
        throw error;
    }
}

export async function discordApiPost(endpoint: string, body: any): Promise<any> {
    if (!API?.post) throw new Error("Internal API not available");
    try {
        return await API.post({ url: `/api/v9${endpoint}`, body });
    } catch (e: any) {
        const error: ApiError = new Error(`API POST failed: ${e.message}`);
        error.status = e.status;
        error.body = e.body;
        if (e.status === 429) {
            const retryAfter = parseRetryAfterMs(e);
            if (retryAfter != null) error.retryAfter = retryAfter;
        }
        throw error;
    }
}

export async function rateLimitedPost(
    endpoint: string,
    body: any,
    isActive: () => boolean = () => true,
    signal?: AbortSignal
): Promise<any> {
    if (!trafficInstance) {
        debugLog(`${LOG_PREFIX} Traffic not initialized, falling back to direct post`);
        return discordApiPost(endpoint, body);
    }
    return trafficInstance.enqueue(endpoint, body, isActive, signal);
}

function parseRetryAfterMs(error: any): number | null {
    const header =
        error?.response?.headers?.get?.("retry-after") ??
        error?.headers?.get?.("retry-after") ??
        error?.retryAfter;
    if (!header) return null;
    const seconds = parseFloat(header);
    if (isNaN(seconds) || seconds < 0) return null;
    return seconds * 1000;
}

export function clearTrafficQueue(): void {
    trafficInstance?.clear();
}
