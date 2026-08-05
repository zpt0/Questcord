import { activeQuests, getProgressBarKey } from "./state";
export function safeTimeout(
    callback: () => void,
    delay: number,
    questId: string,
    userId: string
): number {
    const timeoutId = window.setTimeout(callback, delay);
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.timeoutIds.push(timeoutId);
    }
    return timeoutId;
}
export function safeInterval(
    callback: () => void,
    interval: number,
    questId: string,
    userId: string
): number {
    const intervalId = window.setInterval(callback, interval);
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.intervalIds.push(intervalId);
    }
    return intervalId;
}
export function clearQuestTimers(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.timeoutIds.forEach((id) => clearTimeout(id));
        questData.intervalIds.forEach((id) => clearInterval(id));
        questData.timeoutIds = [];
        questData.intervalIds = [];
    }
}
export function compareVersions(v1: string, v2: string): number {
    const clean1 = v1.replace(/[^0-9.]/g, "");
    const clean2 = v2.replace(/[^0-9.]/g, "");
    const parts1 = clean1.split(".").map((n) => parseInt(n) || 0);
    const parts2 = clean2.split(".").map((n) => parseInt(n) || 0);
    const maxLength = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < maxLength; i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

type ConsoleMethods = "log" | "warn" | "error" | "debug";
const noop = () => {};

export function suppressConsole(
    ...methods: ConsoleMethods[]
): Record<string, (...args: any[]) => any> {
    const originals: Record<string, (...args: any[]) => any> = {};
    for (const m of methods) {
        originals[m] = console[m];
        (console as any)[m] = noop;
    }
    return originals;
}

export function restoreConsole(originals: Record<string, (...args: any[]) => any>): void {
    for (const [method, fn] of Object.entries(originals)) {
        (console as any)[method] = fn;
    }
}
export function getThemeVariables() {
    const isDark = document.documentElement.classList.contains("theme-dark");
    return {
        isDark,
        background: isDark ? "#2f3136" : "#ffffff",
        backgroundSecondary: isDark ? "#292b2f" : "#f2f3f5",
        backgroundSecondaryAlt: isDark ? "#292b2f" : "#ebedef",
        backgroundTertiary: isDark ? "#202225" : "#e3e5e8",
        headerPrimary: isDark ? "#ffffff" : "#060607",
        textNormal: isDark ? "#dcddde" : "#2e3338",
        textMuted: isDark ? "#b9bbbe" : "#4e5058",
        brandColor: "#5865f2",
        dangerColor: "#ed4245",
        successColor: "#43b581",
    };
}

export interface UpdateCheckResult {
    updateAvailable: boolean;
    latestVersion?: string;
    releaseNotes?: string;
    error?: string;
}

export async function checkForUpdate(
    currentVersion: string,
    checkUrl: string,
    timeoutMs = 5000
): Promise<UpdateCheckResult> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(checkUrl, {
            signal: controller.signal,
            headers: { Accept: "application/vnd.github.v3+json" },
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            return { updateAvailable: false, error: `HTTP ${response.status}` };
        }
        const data = await response.json();
        let latestVersion = (data.tag_name || data.name || "").replace(/^v/i, "").trim();
        if (!latestVersion) {
            return { updateAvailable: false, error: "No version found" };
        }
        if (compareVersions(latestVersion, currentVersion) > 0) {
            return {
                updateAvailable: true,
                latestVersion,
                releaseNotes: data.body || "No release notes available.",
            };
        }
        return { updateAvailable: false };
    } catch (e: any) {
        return {
            updateAvailable: false,
            error: e.name === "AbortError" ? "Timeout" : e.message,
        };
    }
}
