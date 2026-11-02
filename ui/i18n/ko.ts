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
    autoComplete: "자동 완료",
    addToQueue: "대기열에 추가",
    startQuestFirst: "먼저 퀘스트 시작",
    removeFromQueue: "대기열에서 제거",
    queued: "대기열에 추가됨 ✓",
    cancel: "취소",
    queue: "대기열",
    queueCount: "대기열 ({count})",
    runFirst: "먼저 실행",
    videos: "동영상",
    games: "게임",
    questsCount: "Quests ({count})",
    noQuestsTitle: "대기열에 퀘스트가 없습니다.",
    noQuestsHint: 'Quest에서 "대기열에 추가"를 사용하세요.',
    remove: "제거",
    clearQueue: "대기열 비우기",
    runAutomatically: "대기열의 퀘스트 자동 실행",
    paused: "일시정지",
    collecting: "오브수집 중...",
    gettingReady: "준비 중...",
    nothingToRun: "실행할 것 없음",
    statusRunning: "실행 중{percent}",
    statusWaiting: "대기 중",
    statusAccepting: "수락 중...",
    statusUnavailable: "사용 불가",
    queueAria: "Quest 대기열",
};
