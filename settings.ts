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

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Display toast notifications for quest events",
        default: true,
        hidden: true,
    },
    notificationDuration: {
        type: OptionType.SLIDER,
        description: "How long notifications stay on screen (seconds)",
        default: 4,
        markers: [1, 2, 3, 4, 6, 8, 10],
        hidden: true,
    },

    autoResumeAfterReload: {
        type: OptionType.BOOLEAN,
        description: "Automatically resume quest automation after Discord reload",
        default: true,
        hidden: true,
    },
    showProgressBar: {
        type: OptionType.BOOLEAN,
        description: "Show a progress bar for active quests",
        default: true,
        hidden: true,
    },
    autoDismissQuestPopups: {
        type: OptionType.BOOLEAN,
        description: "Automatically dismiss quest video and mobile QR code popups",
        default: true,
        hidden: true,
    },
    autoRestartStalled: {
        type: OptionType.BOOLEAN,
        description:
            "Automatically restart quest automation once when progress stalls (off by default)",
        default: false,
        hidden: true,
    },
    activityHeartbeat: {
        type: OptionType.SELECT,
        description: "How often activity quests report progress (slower is safer on rate limits)",
        options: [
            { label: "Fast (~1s, previous behaviour)", value: "fast" },
            { label: "Balanced (~20s)", value: "balanced" },
            { label: "Official pace (~60s)", value: "official" },
        ],
        default: "fast",
        hidden: true,
    },
    queueEnabled: {
        type: OptionType.BOOLEAN,
        description: "Run queued quests automatically (see queue popout)",
        default: true,
        hidden: true,
    },
    queuePreference: {
        type: OptionType.SELECT,
        description: "Which kind of quest the queue runs first",
        options: [
            { label: "Videos first", value: "videos" },
            { label: "Games first", value: "games" },
        ],
        default: "videos",
        hidden: true,
    },

    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Enable debug logging in the console (useful for troubleshooting)",
        default: false,
    },

    showUpdateNotifications: {
        type: OptionType.BOOLEAN,
        description: "Show notifications when a new version is available",
        default: true,
    },

    pillPosition: {
        type: OptionType.SELECT,
        description: "Position of quest progress pill overlays",
        options: [
            { label: "Top Left", value: "top-left" },
            { label: "Top Center", value: "top-center" },
            { label: "Top Right", value: "top-right" },
            { label: "Bottom Left", value: "bottom-left" },
            { label: "Bottom Center", value: "bottom-center" },
            { label: "Bottom Right", value: "bottom-right" },
        ],
        default: "top-center",
        hidden: true,
    },

    pillBgColor: {
        type: OptionType.STRING,
        description: "Pill background color (hex, e.g. #000000)",
        default: "#000000",
        hidden: true,
    },
    pillAccentColor: {
        type: OptionType.STRING,
        description: "Accent color for progress bars, spinners, highlights (hex)",
        default: "#5865F2",
        hidden: true,
    },
    pillTextColor: {
        type: OptionType.STRING,
        description: "Pill title text color (hex)",
        default: "#FFFFFF",
        hidden: true,
    },
    pillPercentColor: {
        type: OptionType.STRING,
        description: "Progress percent text color (hex)",
        default: "#43b581",
        hidden: true,
    },
    pillBarBgColor: {
        type: OptionType.STRING,
        description: "Progress bar background color (hex)",
        default: "#333333",
        hidden: true,
    },
    pillBorderColor: {
        type: OptionType.STRING,
        description: "Pill border color (hex, use 'transparent' for none)",
        default: "rgba(255,255,255,0.08)",
        hidden: true,
    },

    pillBorderRadius: {
        type: OptionType.SLIDER,
        description: "Pill corner roundness (px)",
        default: 24,
        markers: [0, 8, 16, 24, 32],
        hidden: true,
    },
    pillFontSize: {
        type: OptionType.SLIDER,
        description: "Pill text size (px)",
        default: 14,
        markers: [10, 12, 14, 16, 18, 20],
        hidden: true,
    },
    pillOpacity: {
        type: OptionType.SLIDER,
        description: "Pill background opacity",
        default: 85,
        markers: [50, 60, 70, 80, 85, 90, 95, 100],
        hidden: true,
    },
    pillPadding: {
        type: OptionType.SLIDER,
        description: "Pill inner padding (px)",
        default: 8,
        markers: [4, 6, 8, 10, 12, 16],
        hidden: true,
    },
});
