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

/**
 * Discord does not always reflect enrollment in QuestsStore immediately after
 * a successful enroll request. This short-lived marker prevents Questcord from
 * sending the same request again while the store catches up.
 */
const RECENT_TTL_MS = 5 * 60_000;
const recent = new Map<string, number>();

export function markEnrollmentRequested(questId: string, ttl = RECENT_TTL_MS): void {
    recent.set(questId, Date.now() + ttl);
}

export function isEnrollmentRequested(questId: string): boolean {
    const until = recent.get(questId);
    if (until == null) return false;
    if (until <= Date.now()) {
        recent.delete(questId);
        return false;
    }
    return true;
}

export function clearEnrollmentRequested(questId: string): void {
    recent.delete(questId);
}

export function resetEnrollmentMemory(): void {
    recent.clear();
}
