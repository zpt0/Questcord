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

export type Cleanup = () => void;

export interface CleanupResult {
    ran: number;
    failed: number;
}

export interface TaskLifecycle {
    isActive: (questId: string, generation: number) => boolean;
    signalFor: (questId: string, generation: number) => AbortSignal | null;
    addCleanup: (questId: string, generation: number, cleanup: Cleanup) => boolean;
    removeCleanup: (questId: string, generation: number, cleanup: Cleanup) => void;
    waitForDelay: (questId: string, generation: number, ms: number) => Promise<boolean>;
}

export function waitForTaskDelay(ms: number, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout>;

        const finish = (completed: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            resolve(completed);
        };
        const onAbort = () => finish(false);

        timer = setTimeout(() => finish(true), Math.max(0, ms));
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

export class TaskControl {
    public readonly cleanups = new Set<Cleanup>();
    public readonly cancelled: Promise<void>;
    public readonly controller = new AbortController();
    public active = true;
    public started = false;

    private resolveCancelled!: () => void;

    constructor(
        public readonly questId: string,
        public readonly generation: number
    ) {
        this.cancelled = new Promise<void>((resolve) => {
            this.resolveCancelled = resolve;
        });
    }

    cancel(): boolean {
        if (!this.active) return false;
        this.active = false;
        this.controller.abort();
        this.resolveCancelled();
        return true;
    }

    retire(): boolean {
        if (!this.active) return false;
        this.active = false;
        this.controller.abort();
        return true;
    }
}

export class TaskControlRegistry {
    private nextGeneration = 0;
    private readonly controls = new Map<string, TaskControl>();
    private readonly paused = new Set<string>();

    create(questId: string): TaskControl {
        if (this.controls.has(questId)) {
            throw new Error(`Quest ${questId} still has an unsettled task generation`);
        }

        const control = new TaskControl(questId, ++this.nextGeneration);
        this.controls.set(questId, control);
        return control;
    }

    get(questId: string): TaskControl | undefined {
        return this.controls.get(questId);
    }

    markStarted(questId: string, generation: number): boolean {
        const control = this.controls.get(questId);
        if (!control || control.generation !== generation || !control.active) return false;
        control.started = true;
        return true;
    }

    isActive(questId: string, generation: number): boolean {
        const current = this.controls.get(questId);
        return current?.generation === generation && current.active;
    }

    signalFor(questId: string, generation: number): AbortSignal | null {
        const current = this.controls.get(questId);
        return current?.generation === generation ? current.controller.signal : null;
    }

    isPaused(questId: string): boolean {
        return this.paused.has(questId);
    }

    pausedIds(): string[] {
        return Array.from(this.paused);
    }

    clearPaused(): string[] {
        const removed = Array.from(this.paused);
        this.paused.clear();
        return removed;
    }

    addCleanup(questId: string, generation: number, cleanup: Cleanup): boolean {
        const control = this.controls.get(questId);
        if (!control || control.generation !== generation || !control.active) return false;
        control.cleanups.add(cleanup);
        return true;
    }

    removeCleanup(questId: string, generation: number, cleanup: Cleanup): void {
        const control = this.controls.get(questId);
        if (control?.generation === generation) control.cleanups.delete(cleanup);
    }

    waitForDelay(questId: string, generation: number, ms: number): Promise<boolean> {
        const control = this.controls.get(questId);
        if (!control || control.generation !== generation || !control.active)
            return Promise.resolve(false);

        return waitForTaskDelay(ms, control.controller.signal).then(
            (completed) => completed && this.isActive(questId, generation)
        );
    }

    pause(questId: string, onCleanupError?: (error: unknown) => void): CleanupResult | null {
        const control = this.controls.get(questId);
        const wasPaused = this.paused.has(questId);

        if (wasPaused && !control?.active) return null;
        this.paused.add(questId);

        if (!control?.active) return { ran: 0, failed: 0 };

        const result = this.cancelControl(control, onCleanupError);

        if (!control.started && this.controls.get(questId) === control) {
            this.controls.delete(questId);
        }

        return result;
    }

    resume(questId: string): boolean {
        return this.paused.delete(questId);
    }

    pauseAll(
        shouldPause: (questId: string) => boolean = () => true,
        onCleanupError?: (error: unknown) => void
    ): { quests: number; cleanups: CleanupResult } {
        let quests = 0;
        let ran = 0;
        let failed = 0;

        for (const questId of Array.from(this.controls.keys())) {
            if (!shouldPause(questId)) continue;
            const result = this.pause(questId, onCleanupError);
            if (!result) continue;
            quests++;
            ran += result.ran;
            failed += result.failed;
        }

        return { quests, cleanups: { ran, failed } };
    }

    resumeAll(): number {
        const count = this.paused.size;
        this.paused.clear();
        return count;
    }

    cancelAll(onCleanupError?: (error: unknown) => void): CleanupResult {
        let ran = 0;
        let failed = 0;

        for (const [questId, control] of Array.from(this.controls.entries())) {
            if (control.active) {
                const result = this.cancelControl(control, onCleanupError);
                ran += result.ran;
                failed += result.failed;
            }

            if (!control.started && this.controls.get(questId) === control) {
                this.controls.delete(questId);
            }
        }

        return { ran, failed };
    }

    release(
        questId: string,
        generation: number,
        onCleanupError?: (error: unknown) => void
    ): CleanupResult {
        const control = this.controls.get(questId);
        if (!control || control.generation !== generation) return { ran: 0, failed: 0 };

        control.retire();
        const result = this.runCleanups(control, onCleanupError);
        this.controls.delete(questId);
        return result;
    }

    prunePaused(validQuestIds: Set<string>): string[] {
        const removed: string[] = [];
        for (const questId of this.paused) {
            if (validQuestIds.has(questId)) continue;
            this.paused.delete(questId);
            removed.push(questId);
        }
        return removed;
    }

    private cancelControl(
        control: TaskControl,
        onCleanupError?: (error: unknown) => void
    ): CleanupResult {
        control.cancel();
        return this.runCleanups(control, onCleanupError);
    }

    private runCleanups(
        control: TaskControl,
        onCleanupError?: (error: unknown) => void
    ): CleanupResult {
        let ran = 0;
        let failed = 0;
        for (const cleanup of Array.from(control.cleanups)) {
            ran++;
            try {
                cleanup();
            } catch (error) {
                failed++;
                onCleanupError?.(error);
            }
        }
        control.cleanups.clear();
        return { ran, failed };
    }

    getAllControls(): Map<string, TaskControl> {
        return new Map(this.controls);
    }

    clear(): void {
        this.controls.clear();
        this.paused.clear();
    }
}

export const taskControlRegistry = new TaskControlRegistry();
