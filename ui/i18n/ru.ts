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

import type { UiMessages } from "./types";

export const messages: Partial<UiMessages> = {
    autoComplete: "Автозавершение",
    addToQueue: "Добавить в очередь",
    startQuestFirst: "Запустить квест первым",
    removeFromQueue: "Удалить из очереди",
    queued: "В очереди ✓",
    cancel: "Отмена",
    queue: "Очередь",
    queueCount: "Очередь ({count})",
    runFirst: "Запустить первым",
    videos: "Видео",
    games: "Игры",
    questsCount: "Квесты ({count})",
    noQuestsTitle: "Нет квестов в очереди.",
    noQuestsHint: 'Используйте "Добавить в очередь" на квесте.',
    remove: "Удалить",
    clearQueue: "Очистить очередь",
    runAutomatically: "Автоматически запускать квесты из очереди",
    paused: "Пауза",
    collecting: "Сбор орбов...",
    gettingReady: "Подготовка...",
    nothingToRun: "Ничего не запущено",
    statusRunning: "Запущено{percent}",
    statusWaiting: "Ожидание",
    statusAccepting: "Принятие...",
    statusUnavailable: "Недоступно",
    queueAria: "Очередь квестов",
    summaryFinished: "завершено",
    summaryBlocked: "заблокировано",
    summaryFiltered: "отфильтровано (только Orbs)",
    summaryFailed: "провалено",
    unsupported: "Не поддерживается",
    unsupportedAchievementInGame:
        "Для этого задания нужно получить достижение в самой игре, а Questcord не может этого сделать.",
    unsupportedAchievementBypassOff:
        "Включите «Обход достижений» в настройках, чтобы попробовать это задание.",
};
