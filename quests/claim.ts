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

import { settings } from "../settings";
import { keyFor, loadOwned, saveOwned } from "../core/account";
import { QuestsStore, claimQuestReward, fetchQuestRewardCode } from "../core/stores";
import { getQuestName, type Quest } from "../core/types";
import { createScopedLogger } from "../foundation/core/logging";
import { recordCompletion } from "../core/history";
import { notify } from "../ui/notifications";
import {
    assessClaimResponse,
    calculateRetryDelay,
    classifyClaimFailure,
    hasTimestamp,
    selectClaimLocation,
    selectClaimPlatform,
} from "../core/questLogic";

const log = createScopedLogger("quests/claim");

const RETRIES_KEY = "questcord-claim-retries";
const ACTION_DELAY_MS = 1500;
const RECONCILE_TIMEOUT_MS = 5000;
const CLAIM_DELAY_MS = 5000;

interface RetryEntry {
    failures: number;
    retryAt: number;
}

type RewardShape = Record<string, unknown>;

let retries: Record<string, RetryEntry> = {};
let retriesLoaded = false;
let inFlight = new Set<string>();
let successful = new Set<string>();
let autoRunning = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let runtimeGeneration = 0;
const generationListeners = new Set<() => void>();

function changed() {
    generationListeners.forEach((l) => {
        try {
            l();
        } catch {}
    });
}

export function subscribeClaimState(listener: () => void): () => void {
    generationListeners.add(listener);
    return () => generationListeners.delete(listener);
}

export function getClaimState(): {
    inFlight: string[];
    successful: string[];
    autoRunning: boolean;
} {
    return {
        inFlight: [...inFlight],
        successful: [...successful],
        autoRunning,
    };
}

async function loadRetries(): Promise<void> {
    if (retriesLoaded) return;
    try {
        const saved = await loadOwned<Record<string, RetryEntry>>(RETRIES_KEY);
        retries = saved && typeof saved === "object" ? saved : {};
    } catch {
        retries = {};
    }
    retriesLoaded = true;
}

async function persistRetries(): Promise<void> {
    await saveOwned(RETRIES_KEY, retries);
}

function ready(id: string): boolean {
    const retry = retries[id];
    return !retry || retry.retryAt <= Date.now();
}

function markRetry(id: string, base: number, max: number): RetryEntry {
    const failures = Math.min(10, (retries[id]?.failures ?? 0) + 1);
    const entry = { failures, retryAt: Date.now() + calculateRetryDelay(failures, base, max) };
    retries[id] = entry;
    void persistRetries();
    return entry;
}

function clearRetry(id: string): void {
    if (!retries[id]) return;
    delete retries[id];
    void persistRetries();
}

function asRewards(quest: Quest): RewardShape[] | undefined {
    const config = quest.config as Record<string, unknown> | undefined;
    const rewardsConfig = config?.rewardsConfig as Record<string, unknown> | undefined;
    const rewards = rewardsConfig?.rewards ?? config?.rewards;
    if (!Array.isArray(rewards)) return undefined;
    return rewards.filter((r): r is RewardShape => !!r && typeof r === "object");
}

function getClaimStatus(questId: string): Record<string, unknown> | null {
    try {
        const status = QuestsStore?.getQuest?.(questId)?.userStatus;
        return status && typeof status === "object" ? (status as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

function isClaimed(questId: string): boolean {
    return hasTimestamp(getClaimStatus(questId)?.claimedAt);
}

function isCompleted(quest: Quest): boolean {
    return hasTimestamp(quest.userStatus?.completedAt);
}

async function waitForClaimReconciliation(questId: string, generation: number): Promise<boolean> {
    const deadline = Date.now() + RECONCILE_TIMEOUT_MS;
    while (generation === runtimeGeneration && Date.now() < deadline) {
        if (isClaimed(questId)) return true;
        await new Promise((r) => setTimeout(r, 250));
    }
    return false;
}

async function tryRecoverRewardCodeClaim(quest: Quest, generation: number): Promise<boolean> {
    const rewards = asRewards(quest);
    if (selectClaimLocation(rewards) !== 25) return false;
    try {
        if (typeof fetchQuestRewardCode !== "function") return false;
        await fetchQuestRewardCode(quest.id);
        if (generation !== runtimeGeneration) return false;
        return await waitForClaimReconciliation(quest.id, generation);
    } catch (e) {
        log.warn(`Reward-code reconciliation failed for ${getQuestName(quest)}:`, e);
        return false;
    }
}

async function finalize(quest: Quest): Promise<void> {
    successful.add(quest.id);
    clearRetry(quest.id);
    changed();
    try {
        await recordCompletion(quest.id, getQuestName(quest));
    } catch (e) {
        log.warn(`Recorded claim but failed to update stats for ${getQuestName(quest)}:`, e);
    }
}

/** True when a completed quest still has an unclaimed reward (manual UI + auto pass). */
export function canClaimQuest(questId: string): boolean {
    const quest = QuestsStore?.getQuest?.(questId) as Quest | undefined;
    return !!quest && isCompleted(quest) && !isClaimed(questId) && !successful.has(questId);
}

export type ClaimResult =
    | "claimed"
    | "already-claimed"
    | "pending"
    | "captcha"
    | "failed"
    | "not-completed"
    | "disabled"
    | "in-flight"
    | "not-ready";

/** Attempts one native reward claim. Used by both auto mode and the manual button. */
export async function claimQuest(
    questId: string,
    opts: { manual?: boolean } = {}
): Promise<ClaimResult> {
    const mode = (settings.store as { rewardClaimMode?: string }).rewardClaimMode ?? "off";
    if (mode === "off" && !opts.manual) return "disabled";

    await loadRetries();
    if (inFlight.has(questId)) return "in-flight";
    if (!opts.manual && !ready(questId)) return "not-ready";

    const quest = QuestsStore?.getQuest?.(questId) as Quest | undefined;
    if (!quest) return "not-completed";
    if (!isCompleted(quest)) return "not-completed";
    if (isClaimed(questId) || successful.has(questId)) {
        successful.add(quest.id);
        return "already-claimed";
    }

    const generation = runtimeGeneration;
    const rewards = asRewards(quest);
    const config = quest.config as Record<string, unknown> | undefined;
    const rewardsConfig = config?.rewardsConfig as Record<string, unknown> | undefined;
    const platformDecision = selectClaimPlatform(rewardsConfig?.platforms, rewards);
    if (platformDecision.kind === "invalid") {
        if (!opts.manual) markRetry(questId, 30 * 60_000, 6 * 60 * 60_000);
        log.warn(`Unknown reward schema for ${getQuestName(quest)}; failing closed.`);
        return "failed";
    }

    inFlight.add(questId);
    changed();
    try {
        if (typeof claimQuestReward !== "function") {
            throw new Error("Discord's native claim action is unavailable");
        }
        const response = await claimQuestReward(
            quest.id,
            platformDecision.platform,
            selectClaimLocation(rewards)
        );
        if (generation !== runtimeGeneration) return "failed";

        const assessment = assessClaimResponse(response);
        if (assessment.kind === "success") {
            await finalize(quest);
            return "claimed";
        }
        if (assessment.kind === "rewardErrors") {
            if (await waitForClaimReconciliation(questId, generation)) {
                await finalize(quest);
                return "claimed";
            }
            if (await tryRecoverRewardCodeClaim(quest, generation)) {
                await finalize(quest);
                return "claimed";
            }
            if (!opts.manual) markRetry(questId, 30 * 60_000, 6 * 60 * 60_000);
            return "failed";
        }
        if (
            (assessment.kind === "pending" || assessment.kind === "invalid") &&
            (await waitForClaimReconciliation(questId, generation))
        ) {
            await finalize(quest);
            return "claimed";
        }
        return "pending";
    } catch (error) {
        if (generation !== runtimeGeneration) return "failed";
        const failure = classifyClaimFailure(error);
        if (failure.kind !== "captcha" && (await tryRecoverRewardCodeClaim(quest, generation))) {
            await finalize(quest);
            return "claimed";
        }
        if (failure.kind === "captcha") {
            if (!opts.manual) markRetry(questId, 15 * 60_000, 60 * 60_000);
            notify(
                "Reward claim paused",
                `Discord's verification paused the claim for ${getQuestName(quest)}. Confirm it in Discord, then use Claim reward again.`,
                "info"
            );
            return "captcha";
        }
        if (failure.kind === "alreadyClaimed" && isClaimed(questId)) {
            await finalize(quest);
            return "already-claimed";
        }
        if (!opts.manual) {
            const base = failure.kind === "alreadyClaimed" ? 5 * 60_000 : 30 * 60_000;
            const max = failure.kind === "alreadyClaimed" ? 30 * 60_000 : 6 * 60 * 60_000;
            markRetry(questId, base, max);
        }
        log.warn(`Claim failed for ${getQuestName(quest)}:`, error);
        return "failed";
    } finally {
        inFlight.delete(questId);
        changed();
    }
}

function claimableQuests(): Quest[] {
    const store = QuestsStore;
    if (!store) return [];
    let quests: unknown[] = [];
    try {
        if (typeof store.getQuests === "function") {
            const result = store.getQuests();
            quests = Array.isArray(result)
                ? result
                : result && typeof result === "object"
                  ? Object.values(result as Record<string, unknown>)
                  : [];
        } else if (store.quests instanceof Map) {
            quests = [...store.quests.values()];
        }
    } catch {
        return [];
    }

    return quests
        .filter(
            (q): q is Quest => !!q && typeof q === "object" && typeof (q as Quest).id === "string"
        )
        .filter((q) => isCompleted(q) && !isClaimed(q.id) && !successful.has(q.id) && ready(q.id))
        .sort((a, b) => {
            const aExpiry = Date.parse(a.config?.expiresAt ?? "") || Number.POSITIVE_INFINITY;
            const bExpiry = Date.parse(b.config?.expiresAt ?? "") || Number.POSITIVE_INFINITY;
            return aExpiry - bExpiry;
        });
}

async function claimPass(generation: number): Promise<void> {
    if (generation !== runtimeGeneration || !isAutoMode()) return;
    for (const quest of claimableQuests()) {
        if (generation !== runtimeGeneration || !isAutoMode()) return;
        if (inFlight.has(quest.id)) continue;
        await claimQuest(quest.id);
        await new Promise((r) => setTimeout(r, ACTION_DELAY_MS));
    }
}

function isAutoMode(): boolean {
    return (settings.store as { rewardClaimMode?: string }).rewardClaimMode === "auto";
}

function schedule(generation: number, delay = CLAIM_DELAY_MS): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        timer = null;
        if (generation !== runtimeGeneration || !isAutoMode()) return;
        void claimPass(generation).finally(() => schedule(generation));
    }, delay);
}

export function startAutoClaim(): void {
    if (autoRunning) return;
    autoRunning = true;
    runtimeGeneration++;
    successful.clear();
    changed();
    void loadRetries().then(() => {
        const generation = runtimeGeneration;
        void claimPass(generation).finally(() => schedule(generation));
    });
}

export function stopAutoClaim(): void {
    autoRunning = false;
    runtimeGeneration++;
    inFlight.clear();
    successful.clear();
    if (timer) clearTimeout(timer);
    timer = null;
    changed();
}

export function resetClaimRuntime(): void {
    stopAutoClaim();
    retries = {};
    retriesLoaded = false;
    void (async () => {
        const key = keyFor(RETRIES_KEY);
        if (key) {
            try {
                await DataStoreDelete(key);
            } catch {}
        }
    })();
}

// Local alias keeps the storage import surface small in the runtime reset path.
async function DataStoreDelete(key: string): Promise<void> {
    const { DataStore } = await import("@api/index");
    await DataStore.del(key);
}

export function notifyQuestCompleted(questId: string, questName: string): void {
    if (!isAutoMode()) return;
    // Give Discord's quest store a moment to publish completedAt before claiming.
    setTimeout(() => {
        void claimQuest(questId);
    }, CLAIM_DELAY_MS);
    void questName;
}

export const __claimTest = {
    resetForTests() {
        retries = {};
        retriesLoaded = false;
        inFlight = new Set();
        successful = new Set();
        autoRunning = false;
        runtimeGeneration = 0;
        if (timer) clearTimeout(timer);
        timer = null;
    },
};
