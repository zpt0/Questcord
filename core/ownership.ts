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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import type { ResourceHandle, ResourceScope } from "../foundation/core/lifecycle";

type TimerHandle = ReturnType<typeof setTimeout>;
type IntervalHandle = ReturnType<typeof setInterval>;

interface TrackedTimer {
    readonly handle: ResourceHandle<TimerHandle>;
    released: boolean;
}

let ownerScope: ResourceScope | null = null;
let sequence = 0;

// Browsers return numeric timer IDs from setTimeout/setInterval. WeakMap only
// accepts object keys, so these registries must be ordinary Maps.
const timeoutHandles = new Map<TimerHandle, TrackedTimer>();
const intervalHandles = new Map<IntervalHandle, ResourceHandle<IntervalHandle>>();
const observerHandles = new WeakMap<MutationObserver, ResourceHandle<MutationObserver>>();
const abortHandles = new WeakMap<
    AbortController,
    { readonly handle: ResourceHandle<AbortController>; released: boolean }
>();

/** Set by the active plugin runtime. Domain modules borrow lifecycle ownership from here. */
export function setOwnerScope(scope: ResourceScope | null): void {
    ownerScope = scope;
}

export function getOwnerScope(): ResourceScope | null {
    return ownerScope;
}

export function isOwnerActive(): boolean {
    return ownerScope !== null && !ownerScope.isDisposed;
}

function nextId(tag: string): string {
    sequence += 1;
    return `qc:${tag}:${sequence}`;
}

/**
 * Schedules a timeout owned by the active foundation scope. Without an active
 * scope this falls back to a plain timeout so module helpers still work in
 * tests and direct imports.
 */
export function scheduleManagedTimeout(
    callback: () => void,
    ms: number,
    tag: string = "timeout",
    id?: string
): TimerHandle {
    const scope = ownerScope;
    if (!scope || scope.isDisposed) return setTimeout(callback, ms);

    let handle: ResourceHandle<TimerHandle> | undefined;
    const wrapped = () => {
        if (handle) {
            const tracked = timeoutHandles.get(handle.value);
            if (tracked) {
                tracked.released = true;
            }
            timeoutHandles.delete(handle.value);
            void handle.dispose();
        }
        callback();
    };

    const timer = setTimeout(wrapped, ms);
    try {
        handle = scope.register(
            id ?? nextId(tag),
            timer,
            (value) => {
                clearTimeout(value);
                timeoutHandles.delete(value);
            },
            { tags: [tag, "timer"] }
        );
        timeoutHandles.set(timer, { handle, released: false });
    } catch {
        // The scope may be disposing between the isDisposed check and register().
        // Schedule an unowned timer so the callback still runs without crashing.
        clearTimeout(timer);
        setTimeout(callback, ms);
    }
    return timer;
}

export function cancelManagedTimeout(timer: TimerHandle | null | undefined): void {
    if (!timer) return;
    clearTimeout(timer);
    const tracked = timeoutHandles.get(timer);
    if (!tracked) return;
    tracked.released = true;
    timeoutHandles.delete(timer);
    void tracked.handle.dispose();
}

/** Starts an interval owned by the active foundation scope. */
export function createManagedInterval(
    callback: () => void,
    ms: number,
    tag: string = "interval",
    id?: string
): IntervalHandle {
    const scope = ownerScope;
    if (!scope || scope.isDisposed) return setInterval(callback, ms);

    const interval = setInterval(callback, ms);
    try {
        const handle = scope.register(
            id ?? nextId(tag),
            interval,
            (value) => {
                clearInterval(value);
                intervalHandles.delete(value);
            },
            { tags: [tag, "timer"] }
        );
        intervalHandles.set(interval, handle);
    } catch {
        // Registering can race with scope disposal. Keep an unowned interval
        // instead of throwing from watchdog/observer startup paths.
        clearInterval(interval);
        return setInterval(callback, ms);
    }
    return interval;
}

export function cancelManagedInterval(interval: IntervalHandle | null | undefined): void {
    if (!interval) return;
    clearInterval(interval);
    const handle = intervalHandles.get(interval);
    if (!handle) return;
    intervalHandles.delete(interval);
    void handle.dispose();
}

/** Creates a MutationObserver owned by the active foundation scope. */
export function createManagedMutationObserver(
    callback: MutationCallback,
    tag: string = "observer"
): MutationObserver {
    const scope = ownerScope;
    if (!scope || scope.isDisposed) return new MutationObserver(callback);

    const observer = new MutationObserver(callback);
    try {
        const handle = scope.register(nextId(tag), observer, (value) => value.disconnect(), {
            tags: [tag, "dom"],
        });
        observerHandles.set(observer, handle);
    } catch {
        // An unowned observer is still usable; explicit cleanup still disconnects it.
    }
    return observer;
}

export function releaseManagedMutationObserver(
    observer: MutationObserver | null | undefined
): void {
    if (!observer) return;
    const handle = observerHandles.get(observer);
    if (!handle) return;
    observerHandles.delete(observer);
    void handle.dispose();
}

/**
 * Creates an AbortController owned by the active foundation scope. Scope
 * disposal aborts it; explicit release removes it without aborting.
 */
export function createManagedAbortController(tag: string = "request"): AbortController {
    const controller = new AbortController();
    const scope = ownerScope;
    if (!scope || scope.isDisposed) return controller;

    const record = {
        handle: undefined as unknown as ResourceHandle<AbortController>,
        released: false,
    };

    try {
        record.handle = scope.register(
            nextId(tag),
            controller,
            (value) => {
                if (record.released) return;
                value.abort();
            },
            { tags: [tag, "abort"] }
        );
        abortHandles.set(controller, record);
    } catch {
        // An unowned controller is safe; cancellation still works via abort().
    }
    return controller;
}

export function releaseManagedAbortController(
    controller: AbortController | null | undefined
): void {
    if (!controller) return;
    const record = abortHandles.get(controller);
    if (!record) return;
    record.released = true;
    abortHandles.delete(controller);
    void record.handle.dispose();
}
