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
        store.getGameForPID = (checkPid: number) =>
            fakeGames.find((x: any) => x.pid === checkPid);

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
