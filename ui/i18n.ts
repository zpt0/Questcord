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

import { UserStore } from "@webpack/common";

export type UiMessageKey =
    | "autoComplete"
    | "addToQueue"
    | "startQuestFirst"
    | "removeFromQueue"
    | "queued"
    | "cancel"
    | "queue"
    | "queueCount"
    | "runFirst"
    | "videos"
    | "games"
    | "questsCount"
    | "noQuestsTitle"
    | "noQuestsHint"
    | "remove"
    | "clearQueue"
    | "runAutomatically"
    | "paused"
    | "collecting"
    | "gettingReady"
    | "nothingToRun"
    | "statusRunning"
    | "statusWaiting"
    | "statusAccepting"
    | "statusUnavailable"
    | "queueAria";

type UiMessages = Record<UiMessageKey, string>;

const MESSAGES: Record<string, Partial<UiMessages>> = {
    de: {
        autoComplete: "Automatisch abschließen",
        addToQueue: "Zur Warteschlange hinzufügen",
        startQuestFirst: "Erst Quest starten",
        removeFromQueue: "Aus der Warteschlange entfernen",
        queued: "In Warteschlange ✓",
        cancel: "Abbrechen",
        queue: "Warteschlange",
        queueCount: "Warteschlange ({count})",
        runFirst: "Zuerst ausführen",
        videos: "Videos",
        games: "Spiele",
        questsCount: "Quests ({count})",
        noQuestsTitle: "Keine Quests in der Warteschlange.",
        noQuestsHint: 'Nutze "Zur Warteschlange hinzufügen" bei einer Quest.',
        remove: "Entfernen",
        clearQueue: "Warteschlange leeren",
        runAutomatically: "Quests in der Warteschlange automatisch ausführen",
        paused: "Pausiert",
        collecting: "Orbs werden gesammelt...",
        gettingReady: "Wird vorbereitet...",
        nothingToRun: "Nichts auszuführen",
        statusRunning: "Läuft{percent}",
        statusWaiting: "Wartet",
        statusAccepting: "Wird akzeptiert...",
        statusUnavailable: "Nicht verfügbar",
        queueAria: "Quest-Warteschlange",
    },
};

const DEFAULT_KEY = "en-US";

const DEFAULT_MESSAGES: UiMessages = {
    autoComplete: "Auto Complete",
    addToQueue: "Add to queue",
    startQuestFirst: "Start quest first",
    removeFromQueue: "Remove from queue",
    queued: "Queued ✓",
    cancel: "Cancel",
    queue: "Queue",
    queueCount: "Queue ({count})",
    runFirst: "Run first",
    videos: "Videos",
    games: "Games",
    questsCount: "Quests ({count})",
    noQuestsTitle: "No quests queued yet.",
    noQuestsHint: 'Use "Add to queue" on a quest.',
    remove: "Remove",
    clearQueue: "Clear Queue",
    runAutomatically: "Run queued quests automatically",
    paused: "Paused",
    collecting: "Collecting your Orbs...",
    gettingReady: "Getting ready...",
    nothingToRun: "Nothing to run",
    statusRunning: "Running{percent}",
    statusWaiting: "Waiting",
    statusAccepting: "Accepting...",
    statusUnavailable: "Unavailable",
    queueAria: "Quest queue",
};

export function resolveMessages(locale: string | undefined | null): UiMessages {
    const base = (locale ?? "").split("-")[0].toLowerCase();
    if (base && MESSAGES[base]) {
        // spread defaults first so a partial translation falls back per key
        return { ...DEFAULT_MESSAGES, ...MESSAGES[base] };
    }
    return DEFAULT_MESSAGES;
}

export function translateMessage(
    locale: string | undefined | null,
    key: UiMessageKey,
    vars?: Record<string, string | number>
): string {
    const text = resolveMessages(locale)[key] ?? DEFAULT_MESSAGES[key];
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (_match, name: string) =>
        Object.hasOwn(vars, name) ? String(vars[name]) : `{${name}}`
    );
}

export function getLocale(): string {
    try {
        return UserStore.getCurrentUser()?.locale || DEFAULT_KEY;
    } catch {
        return DEFAULT_KEY;
    }
}

export function t(key: UiMessageKey, vars?: Record<string, string | number>): string {
    return translateMessage(getLocale(), key, vars);
}
