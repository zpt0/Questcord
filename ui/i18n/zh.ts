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
    autoComplete: "自动完成",
    addToQueue: "加入队列",
    startQuestFirst: "先开始任务",
    removeFromQueue: "从队列中移除",
    queued: "已加入队列 ✓",
    cancel: "取消",
    queue: "队列",
    queueCount: "队列 ({count})",
    runFirst: "先运行",
    videos: "视频",
    games: "游戏",
    questsCount: "任务 ({count})",
    noQuestsTitle: "队列中没有任务。",
    noQuestsHint: '在任务上使用"加入队列"。',
    remove: "移除",
    clearQueue: "清空队列",
    runAutomatically: "自动运行队列中的任务",
    paused: "已暂停",
    collecting: "收集光球中...",
    gettingReady: "准备中...",
    nothingToRun: "无事可做",
    statusRunning: "运行中{percent}",
    statusWaiting: "等待中",
    statusAccepting: "接受中...",
    statusUnavailable: "不可用",
    queueAria: "任务队列",
    summaryFinished: "已完成",
    summaryBlocked: "已阻止",
    summaryFiltered: "已过滤 (仅Orbs)",
    summaryFailed: "失败",
};
