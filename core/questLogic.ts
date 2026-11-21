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

/**
 * Pure quest logic: no Discord, webpack or Vencord imports.
 * Everything in here is deterministic so it can be unit-tested in isolation.
 */

export type JoinOperator = "and" | "or" | "unknown";

/** Discord's runnable task keys, ordered like the reference quest completer. */
export const RUNNABLE_TASKS = [
    "WATCH_VIDEO",
    "WATCH_VIDEO_ON_MOBILE",
    "WATCH_VIDEO_ON_DESKTOP",
    "PLAY_ON_DESKTOP",
    "STREAM_ON_DESKTOP",
    "PLAY_ACTIVITY",
    "PLAY_ON_XBOX",
    "PLAY_ON_PLAYSTATION",
] as const;

export const CONSOLE_TASKS = new Set(["PLAY_ON_XBOX", "PLAY_ON_PLAYSTATION"]);

export const SERVER_BOUND_TASKS = [
    "PLAY_ON_DESKTOP_V2",
    "ACHIEVEMENT_IN_GAME",
    "ACHIEVEMENT_IN_ACTIVITY",
] as const;

export type TaskName = (typeof RUNNABLE_TASKS)[number];

export function isRunnableTaskName(value: string): value is TaskName {
    return (RUNNABLE_TASKS as readonly string[]).includes(value);
}

/**
 * Stable task ordering based on the platform Discord has selected for a quest.
 * Unknown platforms keep the original order.
 */
export function prioritizeTaskNames(
    taskNames: readonly string[],
    selectedPlatform: unknown
): string[] {
    if (selectedPlatform !== "DESKTOP" && selectedPlatform !== "CONSOLE") {
        return [...taskNames];
    }
    const wantsConsole = selectedPlatform === "CONSOLE";
    return taskNames
        .map((name, index) => ({
            name,
            index,
            selected: CONSOLE_TASKS.has(name) === wantsConsole,
        }))
        .sort(
            (left, right) =>
                Number(right.selected) - Number(left.selected) || left.index - right.index
        )
        .map((entry) => entry.name);
}

export type ClaimFailureKind = "captcha" | "alreadyClaimed" | "terminal" | "transient" | "unknown";

export interface TaskCandidate {
    name: string;
    target: number;
    progress: number;
    runnable: boolean;
}

export interface TaskResolution {
    selected: TaskCandidate | null;
    incompleteUnsupported: string[];
    satisfied: boolean;
}

export type ClaimPlatformDecision = { kind: "selected"; platform: number } | { kind: "invalid" };

export type ClaimResponseAssessment =
    { kind: "success" } | { kind: "pending" } | { kind: "rewardErrors" } | { kind: "invalid" };

/** Retrying these quest errors only produces the same rejection. */
export class TerminalQuestError extends Error {
    constructor(message = "Terminal quest error") {
        super(message);
        this.name = "TerminalQuestError";
    }
}

const ALREADY_CLAIMED_CODE = 260010;
const TERMINAL_STATUSES = new Set([400, 401, 403, 404, 409, 410]);
const TRANSIENT_STATUSES = new Set([408, 425, 429]);

const REWARD_CODE = 1;
const IN_GAME_REWARD = 2;
const COLLECTIBLE_REWARD = 3;
const VIRTUAL_CURRENCY_REWARD = 4;
const FRACTIONAL_PREMIUM_REWARD = 5;
type RewardModalKind =
    "rewardCode" | "inGame" | "collectible" | "virtualCurrency" | "fractionalPremium";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (!isObjectRecord(value)) return false;
    try {
        const proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    } catch {
        return false;
    }
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key);
}

/** Extracts a quest id from Discord's quest Flux payloads, including nested status objects. */
export function getEventQuestId(data: unknown): string | null {
    if (!isObjectRecord(data)) return null;
    const status: Record<string, unknown> | null = isObjectRecord(data.userStatus)
        ? data.userStatus
        : isObjectRecord(data.user_status)
          ? data.user_status
          : null;
    const quest = isObjectRecord(data.quest) ? data.quest : null;
    const id = data.questId ?? data.quest_id ?? quest?.id ?? status?.questId ?? status?.quest_id;
    return typeof id === "string" && /^\d+$/.test(id) ? id : null;
}

function asStatus(value: unknown): number | null {
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string" && /^\d{3}$/.test(value)) return Number(value);
    return null;
}

function asCode(value: unknown): number | null {
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
    return null;
}

function getResponseRecord(value: unknown): Record<string, unknown> | null {
    if (!isObjectRecord(value)) return null;
    if (isPlainRecord(value.body)) return value.body;
    if (isObjectRecord(value.response)) {
        if (isPlainRecord(value.response.body)) return value.response.body;
        if (isPlainRecord(value.response.data)) return value.response.data;
    }
    return isPlainRecord(value) ? value : null;
}

function getStatus(value: unknown): number | null {
    if (!isObjectRecord(value)) return null;
    const direct = asStatus(value.status) ?? asStatus(value.statusCode);
    if (direct !== null) return direct;
    if (!isObjectRecord(value.response)) return null;
    return asStatus(value.response.status) ?? asStatus(value.response.statusCode);
}

export function getErrorStatus(value: unknown): number | null {
    return getStatus(value);
}

export function isTerminalQuestError(value: unknown): boolean {
    if (value instanceof TerminalQuestError) return true;
    const status = getStatus(value);
    return status !== null && TERMINAL_STATUSES.has(status);
}

function ownsCaptchaKey(record: Record<string, unknown> | null): boolean {
    return record !== null && hasOwn(record, "captcha_key") && Array.isArray(record.captcha_key);
}

function isCaptchaCancelError(value: unknown): boolean {
    return value instanceof Error && value.name === "CaptchaCancelError";
}

function hasOfficialCaptchaFields(value: unknown): boolean {
    if (!isObjectRecord(value)) return false;
    if (isPlainRecord(value.captchaFields) && Object.keys(value.captchaFields).length > 0) {
        return true;
    }
    return isPlainRecord(value.fields) && ownsCaptchaKey(value.fields);
}

export function hasTimestamp(value: unknown): boolean {
    if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
        return false;
    }
    return Number.isFinite(new Date(value).getTime());
}

export function normalizeJoinOperator(value: unknown): JoinOperator {
    if (value == null) return "or";
    if (typeof value !== "string") return "unknown";
    const normalized = value.toLowerCase();
    return normalized === "and" || normalized === "or" ? normalized : "unknown";
}

export function isSafeInternalPath(value: unknown): value is string {
    return (
        typeof value === "string" &&
        value.startsWith("/") &&
        !value.startsWith("//") &&
        !value.includes("\\") &&
        !value.includes("\0")
    );
}

/** Capped exponential backoff; failures never reset after a successful wait. */
export function calculateRetryDelay(failures: number, baseDelay: number, maxDelay: number): number {
    const safeFailures = Math.max(1, Math.min(10, Math.floor(failures)));
    return Math.min(maxDelay, baseDelay * 2 ** (safeFailures - 1));
}

/** Resolves AND/OR task groups. Unknown operators fail closed. */
export function resolveTask(
    candidates: readonly TaskCandidate[],
    joinOperator: JoinOperator
): TaskResolution {
    const incomplete = candidates.filter((candidate) => candidate.progress < candidate.target);
    const satisfied =
        incomplete.length === 0 ||
        (joinOperator === "or" &&
            candidates.some((candidate) => candidate.progress >= candidate.target));

    if (satisfied) return { selected: null, incompleteUnsupported: [], satisfied: true };
    if (joinOperator === "unknown") {
        return {
            selected: null,
            incompleteUnsupported: incomplete.map((candidate) => candidate.name),
            satisfied: false,
        };
    }

    return {
        selected: incomplete.find((candidate) => candidate.runnable) ?? null,
        incompleteUnsupported: incomplete
            .filter((candidate) => !candidate.runnable)
            .map((candidate) => candidate.name),
        satisfied: false,
    };
}

function selectRewardModalKind(rewards: unknown): RewardModalKind | null {
    if (rewards == null) return "rewardCode";
    if (!Array.isArray(rewards)) return null;

    const rewardTypes: number[] = [];
    for (const reward of rewards) {
        if (!isPlainRecord(reward)) return null;
        const { type } = reward;
        if (
            typeof type !== "number" ||
            !Number.isInteger(type) ||
            type < REWARD_CODE ||
            type > FRACTIONAL_PREMIUM_REWARD
        ) {
            return null;
        }
        rewardTypes.push(type);
    }

    // Discord's current reward-modal precedence matters for mixed reward arrays:
    // only the in-game modal consumes a configured platform.
    if (rewardTypes.includes(FRACTIONAL_PREMIUM_REWARD)) return "fractionalPremium";
    if (rewardTypes.includes(COLLECTIBLE_REWARD)) return "collectible";
    if (rewardTypes.includes(IN_GAME_REWARD)) return "inGame";
    if (rewardTypes.includes(VIRTUAL_CURRENCY_REWARD)) return "virtualCurrency";
    return "rewardCode";
}

export function selectClaimPlatform(
    platformsValue: unknown,
    rewards: unknown
): ClaimPlatformDecision {
    const modalKind = selectRewardModalKind(rewards);
    if (modalKind === null) return { kind: "invalid" };

    const platforms = platformsValue == null ? [] : platformsValue;
    if (
        !Array.isArray(platforms) ||
        platforms.some(
            (platform) =>
                typeof platform !== "number" ||
                !Number.isInteger(platform) ||
                platform < 0 ||
                platform > 4
        )
    ) {
        return { kind: "invalid" };
    }

    return { kind: "selected", platform: modalKind === "inGame" ? (platforms[0] ?? 0) : 0 };
}

export function selectClaimLocation(rewards: unknown): 11 | 25 {
    return selectRewardModalKind(rewards) === "rewardCode" ? 25 : 11;
}

function hasClaimedTimestamp(body: Record<string, unknown>): boolean {
    if (hasTimestamp(body.claimed_at) || hasTimestamp(body.claimedAt)) return true;
    for (const key of ["user_status", "userStatus", "quest_user_status", "questUserStatus"]) {
        const nested = body[key];
        if (!isPlainRecord(nested)) continue;
        if (hasTimestamp(nested.claimed_at) || hasTimestamp(nested.claimedAt)) return true;
    }
    return false;
}

export function classifyClaimFailure(error: unknown): {
    kind: ClaimFailureKind;
    status: number | null;
} {
    const status = getStatus(error);
    const body = getResponseRecord(error);

    if (
        isCaptchaCancelError(error) ||
        (status === 400 && (ownsCaptchaKey(body) || hasOfficialCaptchaFields(error)))
    ) {
        return { kind: "captcha", status };
    }

    const code = asCode(body?.code) ?? (isObjectRecord(error) ? asCode(error.code) : null);
    if (code === ALREADY_CLAIMED_CODE) return { kind: "alreadyClaimed", status };
    if (status !== null && (TRANSIENT_STATUSES.has(status) || status >= 500)) {
        return { kind: "transient", status };
    }
    if (status !== null && TERMINAL_STATUSES.has(status)) return { kind: "terminal", status };
    return { kind: "unknown", status };
}

export function assessClaimResponse(response: unknown): ClaimResponseAssessment {
    const status = getStatus(response);
    if (status !== null && (status < 200 || status >= 300)) return { kind: "invalid" };

    const body = getResponseRecord(response);
    if (!body) return { kind: "invalid" };
    if (Array.isArray(body.errors) && body.errors.length > 0) return { kind: "rewardErrors" };
    if (hasClaimedTimestamp(body)) return { kind: "success" };
    if (!Array.isArray(body.errors)) return { kind: "invalid" };
    return { kind: "pending" };
}
