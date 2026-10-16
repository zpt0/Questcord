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

const PLAY_CONFIG: DesktopQuestConfig = {
    taskName: "PLAY_ON_DESKTOP",
    questType: "Play",
    progressKey: "PLAY_ON_DESKTOP",
    spoofLabel: "Auto-completing:",
    defaultQuestName: "Play Quest",
    getStoreModule: (modules) =>
        modules.find((x: any) => x?.exports?.Ay?.getRunningGames)?.exports?.Ay ||
        modules.find((x: any) => x?.exports?.ZP?.getRunningGames)?.exports?.ZP,
    spoofStore: (store, applicationId, pid) => {
        const realGetRunningGames = store.getRunningGames;
        const realGetGameForPID = store.getGameForPID;

        const exeName = "app.exe";
        const fakeGame = {
            cmdLine: `C:\\Program Files\\App\\${exeName}`,
            exeName,
            exePath: `c:/program files/app/${exeName}`,
            hidden: false,
            isLauncher: false,
            id: applicationId,
            name: "App",
            pid,
            pidPath: [pid],
            processName: "App",
            start: Date.now(),
        };

        const fakeGames = [fakeGame];
        store.getRunningGames = () => fakeGames;
        store.getGameForPID = (checkPid: number) => fakeGames.find((x: any) => x.pid === checkPid);

        const realGames = realGetRunningGames.call(store);
        return {
            realFunc: { getRunningGames: realGetRunningGames, getGameForPID: realGetGameForPID },
            fakeData: { fakeGame, fakeGames, realGames },
        };
    },
    dispatchEvent: "RUNNING_GAMES_CHANGE",
    restoreStore: (store, realFunc) => {
        store.getRunningGames = realFunc.getRunningGames;
        store.getGameForPID = realFunc.getGameForPID;
    },
    getProgressFromQuest: (quest, lastFallback) =>
        Math.floor(
            quest?.userStatus?.progress?.PLAY_ON_DESKTOP?.value ??
                quest?.userStatus?.streamProgressSeconds ??
                lastFallback
        ),
    getProgressFromHeartbeat: (data, lastFallback) =>
        Math.floor(
            data?.liveQuest?.userStatus?.progress?.PLAY_ON_DESKTOP?.value ??
                data?.userStatus?.progress?.PLAY_ON_DESKTOP?.value ??
                data?.progress?.PLAY_ON_DESKTOP?.value ??
                data?.userStatus?.streamProgressSeconds ??
                lastFallback
        ),
};

export async function completePlayQuest(quest: Quest, userId: string): Promise<boolean> {
    return completeDesktopQuest(quest, userId, PLAY_CONFIG);
}
