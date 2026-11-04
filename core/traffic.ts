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

import { debugLog } from "./state";
import { LOG_PREFIX } from "../constants";

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const rnd = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

const RETRYABLE = new Set([429, 500, 502, 503, 504, 408]);
const CLIENT_ERRORS = new Set([400, 403, 404, 409, 410]);
const MAX_RETRIES = 3;
const MAX_ATTEMPTS = MAX_RETRIES + 1;

type RequestPhase = "queued" | "inflight" | "backoff" | "settled";

interface QueuedRequest<T = any> {
    url: string;
    body: unknown;
    resolve: (value: T) => void;
    reject: (reason: any) => void;
    attempts: number;
    isActive: () => boolean;
    signal?: AbortSignal;
    abortListener?: () => void;
    retryTimer?: ReturnType<typeof setTimeout>;
    phase: RequestPhase;
}

interface ClassifiedError {
    isRetryable: boolean;
    isClientError: boolean;
    status: number | undefined;
    upstreamCode: string | number | null;
    message: string;
}

function classify(error: any): ClassifiedError {
    const status = error?.status ?? error?.statusCode;
    const rawCode = error?.body?.code ?? error?.code;
    return {
        isRetryable: RETRYABLE.has(status),
        isClientError: CLIENT_ERRORS.has(status),
        status,
        upstreamCode: typeof rawCode === "string" || typeof rawCode === "number" ? rawCode : null,
        message: error?.message ?? error?.body?.message ?? `HTTP ${status ?? "UNKNOWN"}`,
    };
}

function cancelledError(): Error {
    const error = new Error("Task cancelled");
    error.name = "AbortError";
    return error;
}

function questIdFromUrl(url: string): string | undefined {
    return url.match(/^\/quests\/(\d+)(?:\/|$)/)?.[1];
}

export class Traffic {
    private queue: QueuedRequest[] = [];
    private processing = false;
    private API: any;
    private isRunning: () => boolean;

    constructor(API: any, isRunning: () => boolean) {
        this.API = API;
        this.isRunning = isRunning;
    }

    enqueue<T = any>(
        url: string,
        body: unknown,
        isActive: () => boolean = () => true,
        signal?: AbortSignal,
    ): Promise<T> {
        if (!this.isRunning()) return Promise.reject(new Error("Stopped"));
        if (!isActive() || signal?.aborted) return Promise.reject(cancelledError());

        return new Promise<T>((resolve, reject) => {
            const req: QueuedRequest<T> = {
                url,
                body,
                resolve,
                reject,
                attempts: 0,
                isActive,
                signal,
                phase: "queued",
            };

            if (signal) {
                req.abortListener = () => {
                    if (req.phase === "inflight" || req.phase === "settled") return;
                    this.rejectCancelled(req);
                };
                signal.addEventListener("abort", req.abortListener, { once: true });
            }

            this.queue.push(req);
            this.process();
        });
    }

    private requestIsActive(req: QueuedRequest): boolean {
        return this.isRunning() && req.isActive() && !req.signal?.aborted;
    }

    private detachAbort(req: QueuedRequest): void {
        if (req.signal && req.abortListener) {
            req.signal.removeEventListener("abort", req.abortListener);
            req.abortListener = undefined;
        }
        if (req.retryTimer) {
            clearTimeout(req.retryTimer);
            req.retryTimer = undefined;
        }
    }

    private settleResolve<T>(req: QueuedRequest<T>, value: T): void {
        if (req.phase === "settled") return;
        req.phase = "settled";
        this.detachAbort(req);
        req.resolve(value);
    }

    private settleReject(req: QueuedRequest, reason: any): void {
        if (req.phase === "settled") return;
        req.phase = "settled";
        this.detachAbort(req);
        req.reject(reason);
    }

    private rejectCancelled(req: QueuedRequest): void {
        this.settleReject(req, this.isRunning() ? cancelledError() : new Error("Shutdown"));
    }

    private async process(): Promise<void> {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        while (this.queue.length > 0) {
            if (!this.isRunning()) {
                for (const req of this.queue) this.settleReject(req, new Error("Shutdown"));
                this.queue = [];
                this.processing = false;
                return;
            }

            const req = this.queue.shift()!;
            if (req.phase === "settled") continue;

            if (!this.requestIsActive(req)) {
                this.rejectCancelled(req);
                continue;
            }

            req.phase = "inflight";
            try {
                const res = await this.API.post({ url: req.url, body: req.body });
                if (this.requestIsActive(req)) this.settleResolve(req, res);
                else this.rejectCancelled(req);
            } catch (e: any) {
                if (!this.requestIsActive(req)) {
                    this.rejectCancelled(req);
                    continue;
                }

                const err = classify(e);

                if (err.isRetryable && req.attempts < MAX_RETRIES) {
                    req.attempts++;
                    const delay = (e.body?.retry_after ?? Math.pow(2, req.attempts)) * 1000;
                    const isGlobal = e.body?.global === true;
                    debugLog(`${LOG_PREFIX} [Traffic] Retry ${req.attempts}/${MAX_RETRIES} in ${(delay / 1000).toFixed(1)}s (HTTP ${err.status})`);
                    const retryJitter = rnd(200, 800);
                    req.phase = "backoff";

                    if (isGlobal) {
                        this.queue.unshift(req);
                        await sleep(delay + retryJitter);
                    } else {
                        req.retryTimer = setTimeout(() => {
                            req.retryTimer = undefined;
                            if (req.phase === "settled") return;
                            if (this.requestIsActive(req)) {
                                req.phase = "queued";
                                this.queue.push(req);
                                this.process();
                            } else {
                                this.rejectCancelled(req);
                            }
                        }, delay + retryJitter);
                    }
                } else if (err.isClientError) {
                    debugLog(`${LOG_PREFIX} [Traffic] HTTP ${err.status}: ${req.url}`);
                    this.settleReject(req, e);
                } else {
                    debugLog(`${LOG_PREFIX} [Traffic] Request to ${req.url} failed: ${err.message}`);
                    this.settleReject(req, e);
                }
            }

            await sleep(rnd(1200, 1800));
        }
        this.processing = false;
    }

    clear(): void {
        for (const req of this.queue) {
            this.detachAbort(req);
            this.settleReject(req, new Error("Cleared"));
        }
        this.queue = [];
    }
}