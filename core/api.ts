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

import { findByPropsLazy } from "@webpack";
import { LOG_PREFIX } from "../constants";
import { Traffic } from "./traffic";
import { debugLog } from "./state";

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
    const token = getDiscordToken();
    if (!token) throw new Error("No Discord token available");
    const response = await fetch(`/api/v9${endpoint}`, {
        method: "GET",
        headers: {
            Authorization: token,
            "Content-Type": "application/json",
        },
    });
    if (!response.ok) {
        const error: ApiError = new Error(`API GET failed: ${response.status}`);
        error.status = response.status;
        if (response.status === 429) {
            const retryAfter = parseRetryAfterMs(response);
            if (retryAfter != null) error.retryAfter = retryAfter;
        }
        try {
            const bodyText = await response.text();
            if (bodyText) {
                try {
                    const parsed = JSON.parse(bodyText);
                    if (parsed?.message) error.message = parsed.message;
                } catch {
                    error.message = bodyText;
                }
            }
        } catch {}
        throw error;
    }
    return response.json();
}

export async function discordApiPost(endpoint: string, body: any): Promise<any> {
    const token = getDiscordToken();
    if (!token) throw new Error("No Discord token available");
    const response = await fetch(`/api/v9${endpoint}`, {
        method: "POST",
        headers: {
            Authorization: token,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        let errorBody = "";
        try {
            errorBody = await response.text();
            console.error(`${LOG_PREFIX} API Error Body:`, errorBody);
        } catch (e) {
            console.warn(`${LOG_PREFIX} Failed to read error body:`, e);
        }
        const error: ApiError = new Error(`API POST failed: ${response.status}`);
        error.status = response.status;
        error.body = errorBody;
        try {
            const parsed = JSON.parse(errorBody);
            if (parsed?.message) error.message = parsed.message;
        } catch {
            if (errorBody) error.message = errorBody;
        }
        if (response.status === 429) {
            const retryAfter = parseRetryAfterMs(response);
            if (retryAfter != null) error.retryAfter = retryAfter;
        }
        throw error;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
}

export async function rateLimitedPost(
    endpoint: string,
    body: any,
    isActive: () => boolean = () => true,
    signal?: AbortSignal,
): Promise<any> {
    if (!trafficInstance) {
        debugLog(`${LOG_PREFIX} Traffic not initialized, falling back to direct post`);
        return discordApiPost(endpoint, body);
    }
    return trafficInstance.enqueue(endpoint, body, isActive, signal);
}

function parseRetryAfterMs(response: Response): number | null {
    const header = response.headers.get("retry-after");
    if (!header) return null;
    const seconds = parseFloat(header);
    if (isNaN(seconds) || seconds < 0) return null;
    return seconds * 1000;
}

export function clearTrafficQueue(): void {
    trafficInstance?.clear();
}
