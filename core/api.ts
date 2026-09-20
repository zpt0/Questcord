import { findByPropsLazy } from "@webpack";
import { LOG_PREFIX } from "../constants";
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

// ── Retry policy (internal, fixed limits — no user settings) ──
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;
const MAX_RATE_LIMIT_DELAY_MS = 15000;
const MAX_ERROR_DELAY_MS = 10000;
const JITTER_MS = 500;

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function computeBackoffDelay(attempt: number, capMs: number): number {
    const backoff = Math.min(BASE_DELAY_MS * (attempt + 1), capMs);
    return backoff + Math.floor(Math.random() * JITTER_MS);
}

function parseRetryAfterMs(response: Response): number | null {
    const header = response.headers.get("retry-after");
    if (!header) return null;
    const seconds = parseFloat(header);
    if (isNaN(seconds) || seconds < 0) return null;
    return seconds * 1000;
}

function getErrorStatus(error: any): number | undefined {
    return error?.status ?? error?.response?.status;
}

function isRateLimitError(error: any): boolean {
    return (
        getErrorStatus(error) === 429 ||
        (typeof error?.message === "string" && error.message.includes("rate limit"))
    );
}

interface RetryDecision {
    shouldRetry: boolean;
    waitMs: number;
    reason: string;
}

function decideRetry(error: any, attempt: number, maxRetries: number): RetryDecision {
    const status = getErrorStatus(error);
    // 4xx (except 429) and auth errors are never retried
    if (status != null && status < 500 && status !== 429) {
        return { shouldRetry: false, waitMs: 0, reason: "" };
    }
    if (attempt >= maxRetries - 1) {
        return { shouldRetry: false, waitMs: 0, reason: "" };
    }
    if (isRateLimitError(error)) {
        return {
            shouldRetry: true,
            waitMs: error?.retryAfter ?? computeBackoffDelay(attempt, MAX_RATE_LIMIT_DELAY_MS),
            reason: "Rate limited",
        };
    }
    if (status == null) {
        return {
            shouldRetry: true,
            waitMs: computeBackoffDelay(attempt, MAX_ERROR_DELAY_MS),
            reason: "Network error",
        };
    }
    return {
        shouldRetry: true,
        waitMs: computeBackoffDelay(attempt, MAX_ERROR_DELAY_MS),
        reason: `Server error ${status}`,
    };
}

export async function discordApiGet(endpoint: string, maxRetries = MAX_RETRIES): Promise<any> {
    const token = getDiscordToken();
    if (!token) throw new Error("No Discord token available");
    let lastError: any = new Error("Max retries exceeded");
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
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
                throw error;
            }
            return response.json();
        } catch (error: any) {
            lastError = error;
            const { shouldRetry, waitMs, reason } = decideRetry(error, attempt, maxRetries);
            if (!shouldRetry) throw error;
            console.warn(
                `${LOG_PREFIX} ${reason}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries}): ${error?.message}`
            );
            await sleep(waitMs);
        }
    }
    throw lastError;
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
    maxRetries = MAX_RETRIES
): Promise<any> {
    let lastError: any = new Error("Max retries exceeded");
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await discordApiPost(endpoint, body);
        } catch (error: any) {
            lastError = error;
            const { shouldRetry, waitMs, reason } = decideRetry(error, attempt, maxRetries);
            if (!shouldRetry) throw error;
            console.warn(
                `${LOG_PREFIX} ${reason}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries}): ${error?.message}`
            );
            await sleep(waitMs);
        }
    }
    throw lastError;
}
