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

import { Quest } from "../core/types";
import { completeDesktopQuest, DesktopQuestConfig } from "./desktopBase";

const STREAM_CONFIG: DesktopQuestConfig = {
    taskName: "STREAM_ON_DESKTOP",
    questType: "Stream",
    progressKey: "STREAM_ON_DESKTOP",
    spoofLabel: "Spoofed stream to",
    defaultQuestName: "Stream Quest",
    getStoreModule: (modules) =>
        modules.find((x: any) => x?.exports?.A?.__proto__?.getStreamerActiveStreamMetadata)?.exports
            ?.A ||
        modules.find((x: any) => x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata)?.exports
            ?.Z,
    spoofStore: (store, applicationId, pid) => {
        const realFunc = store.getStreamerActiveStreamMetadata;
        store.getStreamerActiveStreamMetadata = () => ({
            id: applicationId,
            pid,
            sourceName: null,
        });
        return { realFunc, fakeData: {} };
    },
    dispatchEvent: "QUESTS_SEND_HEARTBEAT_SUCCESS",
    restoreStore: (store, realFunc) => {
        store.getStreamerActiveStreamMetadata = realFunc;
    },
    getProgressFromQuest: (quest, lastFallback) =>
        Math.floor(
            quest?.userStatus?.progress?.STREAM_ON_DESKTOP?.value ??
                quest?.userStatus?.streamProgressSeconds ??
                lastFallback
        ),
    getProgressFromHeartbeat: (data, lastFallback) =>
        Math.floor(
            data?.liveQuest?.userStatus?.progress?.STREAM_ON_DESKTOP?.value ??
                data?.liveQuest?.userStatus?.streamProgressSeconds ??
                data?.userStatus?.progress?.STREAM_ON_DESKTOP?.value ??
                data?.progress?.STREAM_ON_DESKTOP?.value ??
                data?.userStatus?.streamProgressSeconds ??
                lastFallback
        ),
};

export async function completeStreamQuest(quest: Quest, userId: string): Promise<boolean> {
    return completeDesktopQuest(quest, userId, STREAM_CONFIG);
}
