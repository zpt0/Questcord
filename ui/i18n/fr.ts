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
    autoComplete: "Auto-compléter",
    addToQueue: "Ajouter à la file d'attente",
    startQuestFirst: "Démarrer la quête en premier",
    removeFromQueue: "Retirer de la file d'attente",
    queued: "En file d'attente ✓",
    cancel: "Annuler",
    queue: "File d'attente",
    queueCount: "File d'attente ({count})",
    runFirst: "Exécuter en premier",
    videos: "Vidéos",
    games: "Jeux",
    questsCount: "Quêtes ({count})",
    noQuestsTitle: "Aucune quête en file d'attente.",
    noQuestsHint: 'Utilisez "Ajouter à la file d\'attente" sur une quête.',
    remove: "Retirer",
    clearQueue: "Vider la file d'attente",
    runAutomatically: "Exécuter les quêtes de la file d'attente automatiquement",
    paused: "En pause",
    collecting: "Collecte des orbes en cours...",
    gettingReady: "Préparation en cours...",
    nothingToRun: "Rien à exécuter",
    statusRunning: "En cours{percent}",
    statusWaiting: "En attente",
    statusAccepting: "Acceptation...",
    statusUnavailable: "Indisponible",
    queueAria: "File d'attente des quêtes",
    summaryFinished: "terminées",
    summaryBlocked: "bloquées",
    summaryFiltered: "filtrées (orbes uniquement)",
    summaryFailed: "échouées",
};
