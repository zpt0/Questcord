import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
export const settings = definePluginSettings({
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Display toast notifications for quest events",
        default: true,
    },
    notificationDuration: {
        type: OptionType.SLIDER,
        description: "How long notifications stay on screen (seconds)",
        default: 4,
        markers: [1, 2, 3, 4, 6, 8, 10],
    },
    autoResumeAfterReload: {
        type: OptionType.BOOLEAN,
        description: "Automatically resume quest automation after Discord reload",
        default: true,
    },
    showProgressBar: {
        type: OptionType.BOOLEAN,
        description: "Show a progress bar for active quests",
        default: true,
    },
    autoDismissQuestPopups: {
        type: OptionType.BOOLEAN,
        description: "Automatically dismiss quest video and mobile QR code popups",
        default: true,
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
