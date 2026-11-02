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
    addToQueue: "Adicionar à fila",
    startQuestFirst: "Iniciar missão primeiro",
    removeFromQueue: "Remover da fila",
    queued: "Na fila ✓",
    cancel: "Cancel",
    queue: "Fila",
    queueCount: "Fila ({count})",
    runFirst: "Executar primeiro",
    videos: "Vídeos",
    games: "Jogos",
    questsCount: "Missões ({count})",
    noQuestsTitle: "Nenhuma missão na fila.",
    noQuestsHint: 'Use "Adicionar à fila" em uma missão.',
    remove: "Remover",
    clearQueue: "Limpar fila",
    runAutomatically: "Executar missões da fila automaticamente",
    paused: "Pausado",
    collecting: "Coletando orbes...",
    gettingReady: "Preparando...",
    nothingToRun: "Nada para executar",
    statusRunning: "Executando{percent}",
    statusWaiting: "Aguardando",
    statusAccepting: "Aceitando...",
    statusUnavailable: "Indisponível",
    queueAria: "Fila de missões",
};
