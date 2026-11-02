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

import type { UiMessages } from "./types";

export const messages: Partial<UiMessages> = {
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
};