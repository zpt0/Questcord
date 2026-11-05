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

import { Quest, resolveApplicationId, resolveApplicationName } from "../core/types";
import { completeDesktopQuest, DesktopQuestConfig } from "./desktopBase";

interface GameData {
    name: string;
    exeName: string;
    cmdLine: string;
    exePath: string;
    id: string | number;
}

async function fetchGameData(applicationId: string, applicationName: string): Promise<GameData> {
    const cleanName = (applicationName || "App").replace(/[^a-z0-9\s]/gi, "").trim() || "App";
    const safeExe = `${cleanName.replace(/\s+/g, "")}.exe`;
    return {
        name: applicationName || "App",
        exeName: safeExe,
        cmdLine: `C:\\Program Files\\${cleanName}\\${safeExe}`,
        exePath: `c:/program files/${cleanName.toLowerCase()}/${safeExe}`,
        id: applicationId,
    };
}

const PLAY_CONFIG: DesktopQuestConfig = {
    taskName: "PLAY_ON_DESKTOP",
    questType: "Play",
    progressKey: "PLAY_ON_DESKTOP",
    spoofLabel: "Auto-completing:",
    defaultQuestName: "Play Quest",
    getStoreModule: (modules) => {
        for (const m of modules) {
            const exps = m?.exports;
            if (!exps) continue;
            if (exps.Ay?.getRunningGames) return exps.Ay;
            if (exps.ZP?.getRunningGames) return exps.ZP;
            if (exps.getRunningGames) return exps;
            for (const key of Object.keys(exps)) {
                const val = exps[key];
                if (val && typeof val === "object" && typeof val.getRunningGames === "function") {
                    return val;
                }
            }
        }
        return null;
    },
    spoofStore: (store, applicationId, pid, gameData?: GameData) => {
        const realGetRunningGames = store.getRunningGames;
        const realGetGameForPID = store.getGameForPID;

        const fakeGame = gameData
            ? {
                  cmdLine: gameData.cmdLine,
                  exeName: gameData.exeName,
                  exePath: gameData.exePath,
                  hidden: false,
                  isLauncher: false,
                  id: applicationId,
                  name: gameData.name,
                  pid,
                  pidPath: [pid],
                  processName: gameData.exeName.replace(".exe", ""),
                  start: Date.now(),
              }
            : {
                  cmdLine: `C:\\Program Files\\App\\app.exe`,
                  exeName: "app.exe",
                  exePath: `c:/program files/app/app.exe`,
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
    const applicationId = resolveApplicationId(quest);
    const applicationName = resolveApplicationName(quest);

    const gameData = applicationId
        ? await fetchGameData(applicationId, applicationName)
        : undefined;

    return completeDesktopQuest(quest, userId, PLAY_CONFIG, gameData);
}
