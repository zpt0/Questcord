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

/**
 * Convert GitHub-flavored release notes to something Discord's message
 * parser renders correctly: Discord has no `#` headings (they would show
 * literally) and collapses single newlines into spaces (everything ends up
 * on one line). Fenced code blocks are left untouched.
 */
export function formatReleaseNotesForDiscord(notes: string): string {
    const normalized = (notes || "").replace(/\r\n/g, "\n");
    const formatted = normalized
        .split(/(```[\s\S]*?(?:```|$))/g)
        .map((segment, index) => {
            // Odd segments are fenced code blocks — leave them alone.
            if (index % 2 === 1) return segment;
            const converted = segment
                .split("\n")
                .map((line) => {
                    const heading = line.match(/^#{1,6}\s+(.*)$/);
                    if (heading) return `**${heading[1].trim()}**`;
                    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return "";
                    return line;
                })
                .join("\n");
            // Single newlines become paragraph breaks; existing blank lines stay.
            return converted.replace(/(?<!\n)\n(?!\n)/g, "\n\n");
        })
        .join("");
    return formatted.replace(/\n{3,}/g, "\n\n").trim();
}
