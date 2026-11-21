import { OptionType } from "@utils/types";
import { describe, expect, it } from "vitest";

import { definition, settings } from "../settings";

interface ExpectedSetting {
    type: OptionType;
    default?: unknown;
    hidden?: boolean;
    description?: string;
    markers?: number[];
    options?: Array<{ label: string; value: string | number | boolean }>;
}

const LEGACY_SETTINGS: Record<string, ExpectedSetting> = {
    showUpdateNotifications: {
        type: OptionType.BOOLEAN,
        description: "Show notifications when a new version is available",
        default: true,
    },
    discordServerJoin: {
        type: OptionType.BOOLEAN,
        description: "Join the Discord support server once",
        default: true,
    },
    goToUpdateChannel: {
        type: OptionType.BOOLEAN,
        description: "Navigate to the updates channel on start",
        default: true,
    },
    enableAchievementBypass: {
        type: OptionType.BOOLEAN,
        description:
            "Enable achievement-in-activity quest bypass via OAuth (requires relay server on 127.0.0.1:43210)",
        default: false,
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Enable debug logging in the console (useful for troubleshooting)",
        default: false,
    },
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
    playSessionTail: {
        type: OptionType.SLIDER,
        description:
            "How long to keep the spoofed game running after quest completion (minutes, 0 = disabled)",
        default: 2,
        markers: [0, 1, 2, 3, 5, 10],
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
    gameConcurrency: {
        type: OptionType.SLIDER,
        description: "Max concurrent game quests (Discord only tracks one at a time)",
        default: 1,
        markers: [1, 2],
        hidden: true,
    },
    videoConcurrency: {
        type: OptionType.SLIDER,
        description: "Max concurrent video quests (one game plus one video by default)",
        default: 1,
        markers: [1, 2, 3, 4],
        hidden: true,
    },
    watchForEnrollments: {
        type: OptionType.BOOLEAN,
        description: "Auto-start engine when you accept a quest in Discord's Quests page",
        default: true,
        hidden: true,
    },
    autoStart: {
        type: OptionType.BOOLEAN,
        description: "Automatically start the engine on plugin load",
        default: false,
        hidden: true,
    },
    orbQuestsOnly: {
        type: OptionType.BOOLEAN,
        description: "Only run quests that reward Orbs (skips quests with other reward types)",
        default: false,
        hidden: true,
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
        description: "Pill progress bar background color (hex)",
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
        default: 10,
        markers: [0, 4, 8, 10, 12, 16, 20, 24, 32],
        hidden: true,
    },
    pillFontSize: {
        type: OptionType.SLIDER,
        description: "Pill text size (px)",
        default: 13,
        markers: [10, 11, 12, 13, 14, 15, 16, 18, 20],
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
        default: 10,
        markers: [4, 6, 8, 10, 12, 16],
        hidden: true,
    },
};

const FOUNDATION_SETTINGS: Record<string, ExpectedSetting> = {
    foundationBridgeEnabled: { type: OptionType.BOOLEAN, default: false },
    foundationDiagnosticsEnabled: { type: OptionType.BOOLEAN, default: false },
    foundationLogLevel: { type: OptionType.SELECT },
};

const FOUNDATION_SELECT_DEFAULTS: Record<string, string> = {
    activityHeartbeat: "fast",
    queuePreference: "videos",
    pillPosition: "top-center",
    pillStyle: "glass",
};

const PILL_PARITY_SETTINGS: Record<string, ExpectedSetting> = {
    pillStyle: {
        type: OptionType.SELECT,
        description: "Quest pill appearance",
        default: "glass",
        hidden: true,
        options: [
            { label: "Glass (blurred)", value: "glass" },
            { label: "Solid (dark)", value: "solid" },
            { label: "Minimal (flat)", value: "minimal" },
        ],
    },
    pillMaxWidth: {
        type: OptionType.SLIDER,
        description: "Maximum width of quest pills in pixels",
        default: 400,
        markers: [250, 300, 350, 400, 450, 500, 600, 800],
        hidden: true,
    },
    pillShowTimer: {
        type: OptionType.BOOLEAN,
        description: "Show elapsed time on the progress pill",
        default: true,
        hidden: true,
    },
    pillMaxStack: {
        type: OptionType.SLIDER,
        description: "Maximum number of sub pills visible at once",
        default: 5,
        markers: [1, 2, 3, 4, 5, 6, 7, 8],
        hidden: true,
    },
};

describe("Questcord settings compatibility", () => {
    it("exports the foundation definition as the live Vencord settings object", () => {
        expect(settings).toBe(definition.settings);
        expect(settings.def).toBe(definition.definition);
        expect(definition.pluginName).toBe("Questcord");
    });

    it("keeps all 31 legacy setting keys with the Clonecord pill defaults", () => {
        const legacyKeys = Object.keys(LEGACY_SETTINGS);
        expect(legacyKeys).toHaveLength(31);
        for (const key of legacyKeys) {
            expect(definition.keys, `definition key ${key}`).toContain(key);
            assertSetting(key, LEGACY_SETTINGS[key]);
        }
    });

    it("adds the Clonecord pill parity settings", () => {
        for (const [key, expected] of Object.entries(PILL_PARITY_SETTINGS)) {
            expect(definition.keys, `definition key ${key}`).toContain(key);
            assertSetting(key, expected);
        }
    });

    it("adds only the three reserved foundation settings", () => {
        // 31 legacy + 3 foundation + 6 quest feature settings + 4 pill parity settings
        expect(definition.keys).toHaveLength(44);
        for (const key of Object.keys(FOUNDATION_SETTINGS)) {
            expect(definition.keys).toContain(key);
            assertSetting(key, FOUNDATION_SETTINGS[key]);
        }
        expect((definition.definition.foundationLogLevel as any).options).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ value: "warn", default: true }),
                expect.objectContaining({ value: "debug" }),
                expect.objectContaining({ value: "info" }),
                expect.objectContaining({ value: "error" }),
                expect.objectContaining({ value: "none" }),
            ])
        );
    });

    it("keeps the security-sensitive bypass opt-in and default off", () => {
        const bypass = definition.definition.enableAchievementBypass as any;
        expect(bypass.default).toBe(false);
        expect(bypass.hidden).toBeUndefined();
        expect(bypass.description).toContain("127.0.0.1:43210");
        expect(definition.metadata.enableAchievementBypass.docs).toMatch(/security/i);
    });

    it("adds validation-only option defaults without changing select values", () => {
        for (const [key, value] of Object.entries(FOUNDATION_SELECT_DEFAULTS)) {
            const options = (definition.definition[key] as any).options as Array<{
                label: string;
                value: string;
                default?: boolean;
            }>;
            expect(
                options.filter((option) => option.default === true).map((option) => option.value)
            ).toEqual([value]);
        }
    });

    it("records foundation metadata for every setting", () => {
        for (const key of definition.keys) {
            const meta = definition.metadata[key];
            expect(meta, `metadata for ${key}`).toBeDefined();
            expect(meta.section.length).toBeGreaterThan(0);
            expect(Array.isArray(meta.readPaths)).toBe(true);
            expect(meta.readPaths.length).toBeGreaterThan(0);
        }
    });
});

function assertSetting(key: string, expected: ExpectedSetting): void {
    const actual = definition.definition[key] as any;
    expect(actual, `missing setting ${key}`).toBeDefined();
    expect(actual.type, `${key}.type`).toBe(expected.type);

    if ("default" in expected) expect(actual.default, `${key}.default`).toBe(expected.default);
    if (expected.hidden !== undefined)
        expect(Boolean(actual.hidden), `${key}.hidden`).toBe(expected.hidden);
    if (expected.description !== undefined) {
        expect(actual.description, `${key}.description`).toBe(expected.description);
    }
    if (expected.markers) expect(actual.markers, `${key}.markers`).toEqual(expected.markers);
    if (expected.options) {
        expect(actual.options, `${key}.options`).toHaveLength(expected.options.length);
        for (const [index, option] of expected.options.entries()) {
            expect(actual.options[index].label, `${key}.options[${index}].label`).toBe(
                option.label
            );
            expect(actual.options[index].value, `${key}.options[${index}].value`).toBe(
                option.value
            );
        }
    }
}
