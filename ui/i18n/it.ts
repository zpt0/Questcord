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
    autoComplete: "Auto-completa",
    addToQueue: "Aggiungi alla coda",
    startQuestFirst: "Avvia missione prima",
    removeFromQueue: "Rimuovi dalla coda",
    queued: "In coda ✓",
    cancel: "Annulla",
    queue: "Coda",
    queueCount: "Coda ({count})",
    runFirst: "Esegui prima",
    videos: "Video",
    games: "Giochi",
    questsCount: "Missioni ({count})",
    noQuestsTitle: "Nessuna missione in coda.",
    noQuestsHint: 'Usa "Aggiungi alla coda" su una missione.',
    remove: "Rimuovi",
    clearQueue: "Svuota coda",
    runAutomatically: "Esegui automaticamente le missioni in coda",
    paused: "In pausa",
    collecting: "Raccolta orbbe in corso...",
    gettingReady: "Preparazione in corso...",
    nothingToRun: "Niente da eseguire",
    statusRunning: "In esecuzione{percent}",
    statusWaiting: "In attesa",
    statusAccepting: "Accettazione...",
    statusUnavailable: "Non disponibile",
    queueAria: "Coda missioni",
};
