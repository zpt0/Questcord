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
    autoComplete: "自動完了",
    addToQueue: "キューに追加",
    startQuestFirst: "最初にクエストを開始",
    removeFromQueue: "キューから削除",
    queued: "キューに追加済み ✓",
    cancel: "キャンセル",
    queue: "キュー",
    queueCount: "キュー ({count})",
    runFirst: "最初に実行",
    videos: "動画",
    games: "ゲーム",
    questsCount: "クエスト ({count})",
    noQuestsTitle: "キューにクエストはありません。",
    noQuestsHint: "クエストで「キューに追加」を使用してください。",
    remove: "削除",
    clearQueue: "キューをクリア",
    runAutomatically: "キューのクエストを自動実行",
    paused: "一時停止中",
    collecting: "オーブを回収中...",
    gettingReady: "準備中...",
    nothingToRun: "実行するものなし",
    statusRunning: "実行中{percent}",
    statusWaiting: "待機中",
    statusAccepting: "受付中...",
    statusUnavailable: "利用不可",
    queueAria: "クエストキュー",
};
