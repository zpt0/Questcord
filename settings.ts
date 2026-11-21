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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { OptionType } from "@utils/types";

import { defineFoundationSettings } from "./foundation/settings/definition";
import type { FoundationSettingMeta } from "./foundation/settings/types";

function meta(
    section: FoundationSettingMeta["section"],
    order: number,
    readPaths: readonly string[],
    docs?: string
): FoundationSettingMeta {
    return { section, order, changeMode: "live", readPaths, docs };
}

export const definition = defineFoundationSettings("Questcord", {
    // ─── Normal (visible) settings ──────────────────────────────────────────
    showUpdateNotifications: {
        type: OptionType.BOOLEAN,
        description: "Show notifications when a new version is available",
        default: true,
        foundation: meta("Behavior", 10, ["settings.ts"], "Preserved legacy setting."),
    },
    discordServerJoin: {
        type: OptionType.BOOLEAN,
        description: "Join the Discord support server once",
        default: true,
        foundation: meta("Behavior", 11, ["settings.ts"], "Preserved legacy setting."),
    },
    goToUpdateChannel: {
        type: OptionType.BOOLEAN,
        description: "Navigate to the updates channel on start",
        default: true,
        foundation: meta("Behavior", 12, ["settings.ts"], "Preserved legacy setting."),
    },
    enableAchievementBypass: {
        type: OptionType.BOOLEAN,
        description:
            "Enable achievement-in-activity quest bypass via OAuth (requires relay server on 127.0.0.1:43210)",
        default: false,
        foundation: meta(
            "Behavior",
            13,
            [
                "quests/achievementBypass.ts",
                "quests/activity.ts",
                "quests/manager.ts",
                "ui/QuestButton.tsx",
                "index.tsx",
            ],
            "Security-sensitive opt-in. Default and consent gate are preserved."
        ),
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Enable debug logging in the console (useful for troubleshooting)",
        default: false,
        foundation: meta("Diagnostics", 10, ["core/state.ts", "index.tsx"]),
    },

    // ─── Hidden (customization) settings ────────────────────────────────────
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Display toast notifications for quest events",
        default: true,
        hidden: true,
        foundation: meta("Notifications", 10, [
            "ui/notifications.ts",
            "components/UnifiedSettings.tsx",
        ]),
    },
    notificationDuration: {
        type: OptionType.SLIDER,
        description: "How long notifications stay on screen (seconds)",
        default: 4,
        markers: [1, 2, 3, 4, 6, 8, 10],
        hidden: true,
        foundation: meta("Notifications", 11, [
            "ui/notifications.ts",
            "components/UnifiedSettings.tsx",
        ]),
    },
    pillShowTimer: {
        type: OptionType.BOOLEAN,
        description: "Show elapsed time on the progress pill",
        default: true,
        hidden: true,
        foundation: meta("Notifications", 12, [
            "ui/notifications.ts",
            "components/DesignPreview.tsx",
        ]),
    },
    pillMaxStack: {
        type: OptionType.SLIDER,
        description: "Maximum number of sub pills visible at once",
        default: 5,
        markers: [1, 2, 3, 4, 5, 6, 7, 8],
        hidden: true,
        foundation: meta("Notifications", 13, [
            "ui/notifications.ts",
            "components/UnifiedSettings.tsx",
        ]),
    },

    autoResumeAfterReload: {
        type: OptionType.BOOLEAN,
        description: "Automatically resume quest automation after Discord reload",
        default: true,
        hidden: true,
        foundation: meta("Behavior", 20, ["quests/manager.ts", "components/UnifiedSettings.tsx"]),
    },
    showProgressBar: {
        type: OptionType.BOOLEAN,
        description: "Show a progress bar for active quests",
        default: true,
        hidden: true,
        foundation: meta("Appearance", 10, [
            "ui/progressBar.ts",
            "ui/notifications.ts",
            "quests/questProgress.ts",
        ]),
    },
    autoDismissQuestPopups: {
        type: OptionType.BOOLEAN,
        description: "Automatically dismiss quest video and mobile QR code popups",
        default: true,
        hidden: true,
        foundation: meta("Behavior", 21, ["ui/questVideoDismiss.ts", "index.tsx"]),
    },
    autoRestartStalled: {
        type: OptionType.BOOLEAN,
        description:
            "Automatically restart quest automation once when progress stalls (off by default)",
        default: false,
        hidden: true,
        foundation: meta("Behavior", 22, ["index.tsx", "core/watchdog.ts"]),
    },
    playSessionTail: {
        type: OptionType.SLIDER,
        description:
            "How long to keep the spoofed game running after quest completion (minutes, 0 = disabled)",
        default: 2,
        markers: [0, 1, 2, 3, 5, 10],
        hidden: true,
        foundation: meta("Behavior", 23, [
            "quests/desktopBase.ts",
            "components/UnifiedSettings.tsx",
        ]),
    },
    activityHeartbeat: {
        type: OptionType.SELECT,
        description: "How often activity quests report progress (slower is safer on rate limits)",
        options: [
            { label: "Fast (~1s, previous behaviour)", value: "fast", default: true },
            { label: "Balanced (~20s)", value: "balanced" },
            { label: "Official pace (~60s)", value: "official" },
        ],
        default: "fast",
        hidden: true,
        foundation: meta("Behavior", 24, ["quests/activity.ts", "components/UnifiedSettings.tsx"]),
    },
    queueEnabled: {
        type: OptionType.BOOLEAN,
        description: "Run queued quests automatically (see queue popout)",
        default: true,
        hidden: true,
        foundation: meta("Behavior", 25, ["quests/queue/store.ts"]),
    },
    queuePreference: {
        type: OptionType.SELECT,
        description: "Which kind of quest the queue runs first",
        options: [
            { label: "Videos first", value: "videos", default: true },
            { label: "Games first", value: "games" },
        ],
        default: "videos",
        hidden: true,
        foundation: meta("Behavior", 26, ["ui/QuestButton.tsx"]),
    },
    gameConcurrency: {
        type: OptionType.SLIDER,
        description: "Max concurrent game quests (Discord only tracks one at a time)",
        default: 1,
        markers: [1, 2],
        hidden: true,
        foundation: meta("Behavior", 27, ["quests/scheduler.ts"]),
    },
    videoConcurrency: {
        type: OptionType.SLIDER,
        description: "Max concurrent video quests (one game plus one video by default)",
        default: 1,
        markers: [1, 2, 3, 4],
        hidden: true,
        foundation: meta("Behavior", 28, ["quests/scheduler.ts"]),
    },
    watchForEnrollments: {
        type: OptionType.BOOLEAN,
        description: "Auto-start engine when you accept a quest in Discord's Quests page",
        default: true,
        hidden: true,
        foundation: meta("Behavior", 29, ["index.tsx"]),
    },
    autoStart: {
        type: OptionType.BOOLEAN,
        description: "Automatically start the engine on plugin load",
        default: false,
        hidden: true,
        foundation: meta("Behavior", 30, ["index.tsx"]),
    },

    // ─── Quest feature settings (A–G) ──────────────────────────────────────
    autoEnrollQuests: {
        type: OptionType.BOOLEAN,
        description: "Proactively enroll in compatible active quests",
        default: false,
        hidden: true,
        foundation: meta("Behavior", 32, ["quests/autoEnroll.ts", "index.tsx"]),
    },
    rewardClaimMode: {
        type: OptionType.SELECT,
        description: "Claim completed quest rewards automatically or manually",
        options: [
            { label: "Off — claim in Discord", value: "off", default: true },
            { label: "Auto — claim in the background", value: "auto" },
            { label: "Manual — button only", value: "manual" },
        ],
        default: "off",
        hidden: true,
        foundation: meta("Behavior", 33, ["quests/claim.ts", "index.tsx"]),
    },
    trackQuestHistory: {
        type: OptionType.BOOLEAN,
        description: "Keep a local count and history of confirmed quest completions",
        default: true,
        hidden: true,
        foundation: meta("Behavior", 34, ["core/history.ts", "index.tsx"]),
    },
    autoResolveTasks: {
        type: OptionType.BOOLEAN,
        description: "Resolve AND/OR quest task groups automatically",
        default: true,
        hidden: true,
        foundation: meta("Behavior", 35, ["quests/questRunnability.ts"]),
    },
    consoleQuestMode: {
        type: OptionType.SELECT,
        description: "Track linked Xbox/PlayStation quests",
        options: [
            { label: "Off — skip console quests", value: "off", default: true },
            { label: "Manual — start tracking yourself", value: "manual" },
            { label: "Auto — track when queued", value: "auto" },
        ],
        default: "off",
        hidden: true,
        foundation: meta("Behavior", 36, ["quests/consoleTracking.ts", "quests/queue/order.ts"]),
    },
    captchaClaimBehavior: {
        type: OptionType.SELECT,
        description: "What to do when Discord asks for verification during a reward claim",
        options: [
            { label: "Pause and notify", value: "pause", default: true },
            { label: "Retry later automatically", value: "retry" },
            { label: "Skip this claim", value: "skip" },
        ],
        default: "pause",
        hidden: true,
        foundation: meta("Behavior", 37, ["quests/claim.ts"]),
    },
    orbQuestsOnly: {
        type: OptionType.BOOLEAN,
        description: "Only run quests that reward Orbs (skips quests with other reward types)",
        default: false,
        hidden: true,
        foundation: meta("Behavior", 31, ["index.tsx", "quests/manager.ts"]),
    },

    pillPosition: {
        type: OptionType.SELECT,
        description: "Position of quest progress pill overlays",
        options: [
            { label: "Top Left", value: "top-left" },
            { label: "Top Center", value: "top-center", default: true },
            { label: "Top Right", value: "top-right" },
            { label: "Bottom Left", value: "bottom-left" },
            { label: "Bottom Center", value: "bottom-center" },
            { label: "Bottom Right", value: "bottom-right" },
        ],
        default: "top-center",
        hidden: true,
        foundation: meta("Appearance", 11, ["ui/pillStyles.ts", "components/UnifiedSettings.tsx"]),
    },
    pillStyle: {
        type: OptionType.SELECT,
        description: "Quest pill appearance",
        options: [
            { label: "Glass (blurred)", value: "glass", default: true },
            { label: "Solid (dark)", value: "solid" },
            { label: "Minimal (flat)", value: "minimal" },
        ],
        default: "glass",
        hidden: true,
        foundation: meta("Appearance", 12, ["ui/pillStyles.ts", "components/DesignPreview.tsx"]),
    },
    pillBgColor: {
        type: OptionType.STRING,
        description: "Pill background color (hex, e.g. #000000)",
        default: "#000000",
        hidden: true,
        foundation: meta("Appearance", 13, ["ui/pillStyles.ts", "components/UnifiedSettings.tsx"]),
    },
    pillAccentColor: {
        type: OptionType.STRING,
        description: "Accent color for progress bars, spinners, highlights (hex)",
        default: "#5865F2",
        hidden: true,
        foundation: meta("Appearance", 14, ["ui/pillStyles.ts", "components/UnifiedSettings.tsx"]),
    },
    pillTextColor: {
        type: OptionType.STRING,
        description: "Pill title text color (hex)",
        default: "#FFFFFF",
        hidden: true,
        foundation: meta("Appearance", 15, ["ui/pillStyles.ts", "components/UnifiedSettings.tsx"]),
    },
    pillPercentColor: {
        type: OptionType.STRING,
        description: "Progress percent text color (hex)",
        default: "#43b581",
        hidden: true,
        foundation: meta("Appearance", 16, ["ui/pillStyles.ts", "components/UnifiedSettings.tsx"]),
    },
    pillBarBgColor: {
        type: OptionType.STRING,
        description: "Pill progress bar background color (hex)",
        default: "#333333",
        hidden: true,
        foundation: meta("Appearance", 17, ["ui/pillStyles.ts", "components/UnifiedSettings.tsx"]),
    },
    pillBorderColor: {
        type: OptionType.STRING,
        description: "Pill border color (hex, use 'transparent' for none)",
        default: "rgba(255,255,255,0.08)",
        hidden: true,
        foundation: meta("Appearance", 18, ["ui/pillStyles.ts", "components/UnifiedSettings.tsx"]),
    },

    pillBorderRadius: {
        type: OptionType.SLIDER,
        description: "Pill corner roundness (px)",
        default: 10,
        markers: [0, 4, 8, 10, 12, 16, 20, 24, 32],
        hidden: true,
        foundation: meta("Appearance", 19, ["ui/pillStyles.ts", "components/UnifiedSettings.tsx"]),
    },
    pillFontSize: {
        type: OptionType.SLIDER,
        description: "Pill text size (px)",
        default: 13,
        markers: [10, 11, 12, 13, 14, 15, 16, 18, 20],
        hidden: true,
        foundation: meta("Appearance", 20, ["ui/pillStyles.ts", "components/UnifiedSettings.tsx"]),
    },
    pillOpacity: {
        type: OptionType.SLIDER,
        description: "Pill background opacity",
        default: 85,
        markers: [50, 60, 70, 80, 85, 90, 95, 100],
        hidden: true,
        foundation: meta("Appearance", 21, ["ui/pillStyles.ts", "components/UnifiedSettings.tsx"]),
    },
    pillPadding: {
        type: OptionType.SLIDER,
        description: "Pill inner padding (px)",
        default: 10,
        markers: [4, 6, 8, 10, 12, 16],
        hidden: true,
        foundation: meta("Appearance", 22, ["ui/pillStyles.ts", "components/UnifiedSettings.tsx"]),
    },
    pillMaxWidth: {
        type: OptionType.SLIDER,
        description: "Maximum width of quest pills in pixels",
        default: 400,
        markers: [250, 300, 350, 400, 450, 500, 600, 800],
        hidden: true,
        foundation: meta("Appearance", 23, ["ui/pillStyles.ts", "components/DesignPreview.tsx"]),
    },
});

export const settings = definition.settings;
