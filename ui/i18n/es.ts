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
    autoComplete: "Auto completar",
    addToQueue: "Añadir a la cola",
    startQuestFirst: "Iniciar misión primero",
    removeFromQueue: "Quitar de la cola",
    queued: "En cola ✓",
    cancel: "_cancelar",
    queue: "Cola",
    queueCount: "Cola ({count})",
    runFirst: "Ejecutar primero",
    videos: "Vídeos",
    games: "Juegos",
    questsCount: "Misiones ({count})",
    noQuestsTitle: "No hay misiones en cola.",
    noQuestsHint: 'Usa "Añadir a la cola" en una misión.',
    remove: "Quitar",
    clearQueue: "Vaciar cola",
    runAutomatically: "Ejecutar misiones de la cola automáticamente",
    paused: "Pausado",
    collecting: "Recogiendo orbes...",
    gettingReady: "Preparando...",
    nothingToRun: "Nada para ejecutar",
    statusRunning: "Ejecutando{percent}",
    statusWaiting: "Esperando",
    statusAccepting: "Aceptando...",
    statusUnavailable: "No disponible",
    queueAria: "Cola de misiones",
};