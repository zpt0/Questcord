import { React } from "@webpack/common";
import { GITHUB_RELEASE_URL, PLUGIN_AUTHOR, PLUGIN_VERSION, UPDATE_CHECK_URL } from "../constants";
import type { UpdateTarget } from "../foundation/core/updates";
import {
    FoundationAboutPanel,
    FoundationAuthorPanel,
    FoundationLogViewer,
    FoundationPatchStatus,
    FoundationUpdatePanel,
} from "../foundation/ui/components";
import { patchManifest } from "../patches";
import { getActiveRuntime } from "../pluginRuntime";
import { clearSavedQuestStates } from "../quests/manager";
import { getStats, resetStats, subscribeStats } from "../core/history";
import { definition, settings } from "../settings";
import { notify } from "../ui/notifications";
import {
    type SettingFieldDefinition,
    SettingsApp,
    type UnifiedSettingsConfig,
    resetSettingKeys,
} from "../platform/settings";
import { DesignPreview } from "./DesignPreview";

function field(
    key: string,
    label: string,
    description: string,
    info: string,
    extra: Partial<SettingFieldDefinition> = {}
): SettingFieldDefinition {
    return { key, label, description, info, ...extra };
}

const DESIGN_KEYS = [
    "showProgressBar",
    "pillPosition",
    "pillBgColor",
    "pillAccentColor",
    "pillTextColor",
    "pillPercentColor",
    "pillBarBgColor",
    "pillBorderColor",
    "pillBorderRadius",
    "pillFontSize",
    "pillOpacity",
    "pillPadding",
];

const ALL_KEYS = Object.keys(definition.definition);

const UPDATE_TARGETS: readonly UpdateTarget[] = [
    {
        pluginName: "Questcord",
        version: PLUGIN_VERSION,
        checkUrl: UPDATE_CHECK_URL,
        releasesUrl: GITHUB_RELEASE_URL,
        changelogUrl: "https://github.com/zpt0/Questcord/blob/main/CHANGELOG.md",
    },
];

function QuestAbout() {
    return (
        <div className="vc-platform-settings-about-stack">
            <FoundationAboutPanel
                pluginName="Questcord"
                version={PLUGIN_VERSION}
                definition={definition.definition}
                lifecycleState={getActiveRuntime() ? "started" : "idle"}
            />
            <FoundationAuthorPanel authors={[PLUGIN_AUTHOR]} />
        </div>
    );
}

function QuestHistory() {
    const [stats, setStats] = React.useState(getStats());

    React.useEffect(() => subscribeStats(() => setStats({ ...getStats() })), []);

    return (
        <div className="vc-platform-settings-about-stack">
            <div className="vc-platform-settings-card">
                <div className="vc-platform-settings-card-header">Quest history</div>
                <div className="vc-platform-settings-card-body">
                    <div>Confirmed completions: {stats.count}</div>
                    {stats.history.length > 0 ? (
                        <ul>
                            {stats.history.map((entry) => (
                                <li key={entry.questId || entry.completedAt}>
                                    {entry.questName} —{" "}
                                    {new Date(entry.completedAt).toLocaleString()}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div>No completions recorded yet.</div>
                    )}
                    <button
                        onClick={() => {
                            void resetStats();
                            notify("Quest history cleared", "Stats have been reset", "info");
                        }}
                    >
                        Reset quest history
                    </button>
                </div>
            </div>
        </div>
    );
}

export const config: UnifiedSettingsConfig = {
    pluginName: "Questcord",
    version: PLUGIN_VERSION,
    tagline: "Quest automation with a compact, lane-aware queue and real-time progress.",
    license: "AGPL-3.0-only · zpt0.dev",
    sourceUrl: "https://github.com/zpt0/Questcord",
    updates: UPDATE_TARGETS,
    settings,
    definition: definition.definition,
    categories: [
        {
            id: "essential",
            title: "Essential",
            description: "Primary automation controls and what Questcord starts automatically.",
            groups: [
                {
                    id: "questcord-engine",
                    title: "Quest engine",
                    description: "The two controls most users need to change.",
                    fields: [
                        field(
                            "queueEnabled",
                            "Queue automation",
                            "Run queued quests automatically.",
                            "When disabled, quests can still be added to the queue but nothing starts until you turn this back on."
                        ),
                        field(
                            "watchForEnrollments",
                            "Watch enrollments",
                            "Start the engine when you accept a quest in Discord's Quests page.",
                            "Questcord listens for Discord's enrollment event. Auto Complete only appears for quests you have actually enrolled in."
                        ),
                        field(
                            "autoResumeAfterReload",
                            "Resume after reload",
                            "Continue unfinished quest automation after Discord reloads.",
                            "Saved quest state is restored after a full Discord restart. Clear saved quests in Developer if you want a clean slate."
                        ),
                        field(
                            "autoStart",
                            "Start on load",
                            "Automatically start the automation engine when the plugin loads.",
                            "Off by default. With this off, Questcord starts when you enqueue a quest or Discord reports an enrollment."
                        ),
                        field(
                            "orbQuestsOnly",
                            "Orb quests only",
                            "Skip quests that do not reward Orbs.",
                            "Turning this off restores quests that were previously skipped by the Orb filter."
                        ),
                    ],
                },
            ],
        },
        {
            id: "general",
            title: "General",
            description: "Everyday behavior for quest popups, updates and the community server.",
            groups: [
                {
                    id: "questcord-flow",
                    title: "Quest flow",
                    fields: [
                        field(
                            "autoDismissQuestPopups",
                            "Dismiss quest popups",
                            "Close quest video and mobile QR popups automatically.",
                            "Only Discord's ad-video close control is clicked. Generic close buttons are never touched, so Vencord settings stay open."
                        ),
                        field(
                            "autoRestartStalled",
                            "Restart when stalled",
                            "Restart automation once if quest progress stops.",
                            "Off by default. A single retry avoids looping on quests Discord no longer considers active."
                        ),
                        field(
                            "playSessionTail",
                            "Session tail",
                            "Keep the spoofed game running briefly after completion.",
                            "0 disables the tail. Values are minutes; a short tail helps Discord register the final progress event.",
                            { width: "full" }
                        ),
                        field(
                            "activityHeartbeat",
                            "Activity heartbeat",
                            "How often activity quests report progress.",
                            "Fast matches the original behavior. Balanced and official pace reduce rate-limit pressure."
                        ),
                    ],
                },
                {
                    id: "questcord-updates",
                    title: "Updates & community",
                    fields: [
                        field(
                            "showUpdateNotifications",
                            "Update notifications",
                            "Show a notification when a new version is available.",
                            "This only controls notifications. It does not open a browser tab by itself."
                        ),
                        field(
                            "discordServerJoin",
                            "Join support server",
                            "Join the Discord support server once.",
                            "Stored once per browser profile; after the first join Questcord stops prompting."
                        ),
                        field(
                            "goToUpdateChannel",
                            "Updates channel",
                            "Navigate to the updates channel on start.",
                            "Only used when the support server has not already been joined."
                        ),
                    ],
                },
            ],
        },
        {
            id: "updates",
            title: "Updates",
            description: "Release feed status and the current changelog.",
            groups: [
                {
                    id: "questcord-release-feed",
                    title: "Release feed",
                    description: "Checks GitHub Releases on demand and links to the changelog.",
                    render: () => <FoundationUpdatePanel targets={UPDATE_TARGETS} />,
                },
            ],
        },
        {
            id: "design",
            title: "Design",
            description:
                "Progress pill placement, style, colors, geometry and notification limits.",
            groups: [
                {
                    id: "questcord-design-preview",
                    title: "Live preview",
                    description: "Every quest pill bubble using the current Design values.",
                    render: DesignPreview,
                },
                {
                    id: "questcord-pill-layout",
                    title: "Progress pill",
                    fields: [
                        field(
                            "showProgressBar",
                            "Show progress bar",
                            "Display a progress bar for active quests.",
                            "Turn this off to keep notifications only; the automation itself is unchanged."
                        ),
                        field(
                            "pillStyle",
                            "Style",
                            "Quest pill appearance.",
                            "Glass blurs the background, solid is flat and minimal removes the surface border."
                        ),
                        field(
                            "pillPosition",
                            "Position",
                            "Where quest progress pills appear.",
                            "Six anchor points are supported. The default is top center."
                        ),
                    ],
                },
                {
                    id: "questcord-pill-colors",
                    title: "Colors",
                    description:
                        "Each value accepts hex or CSS color syntax used by the pill renderer.",
                    fields: [
                        field(
                            "pillBgColor",
                            "Background",
                            "Pill background color.",
                            "Applied to the pill container."
                        ),
                        field(
                            "pillAccentColor",
                            "Accent",
                            "Progress bar, spinner and highlight color.",
                            "Used for the animated progress elements inside the pill."
                        ),
                        field(
                            "pillTextColor",
                            "Text",
                            "Pill title text color.",
                            "Applies to the primary label."
                        ),
                        field(
                            "pillPercentColor",
                            "Percent",
                            "Progress percentage text color.",
                            "Applies only to the numeric progress label."
                        ),
                        field(
                            "pillBarBgColor",
                            "Bar track",
                            "Progress bar background color.",
                            "This is the unfilled portion of the progress bar."
                        ),
                        field(
                            "pillBorderColor",
                            "Border",
                            "Pill border color.",
                            "Use transparent to remove the border without changing layout."
                        ),
                    ],
                },
                {
                    id: "questcord-pill-geometry",
                    title: "Geometry",
                    fields: [
                        field(
                            "pillBorderRadius",
                            "Corner radius",
                            "Pill corner roundness.",
                            "Measured in pixels."
                        ),
                        field(
                            "pillFontSize",
                            "Font size",
                            "Pill text size.",
                            "Measured in pixels."
                        ),
                        field(
                            "pillOpacity",
                            "Opacity",
                            "Pill background opacity.",
                            "Measured as a percentage."
                        ),
                        field(
                            "pillPadding",
                            "Padding",
                            "Pill inner spacing.",
                            "Measured in pixels."
                        ),
                        field(
                            "pillMaxWidth",
                            "Max width",
                            "Maximum width of quest pills.",
                            "Measured in pixels. The default matches Clonecord's 400px pill width."
                        ),
                    ],
                },
            ],
        },
        {
            id: "notifications",
            title: "Notifications",
            description: "Toast visibility and duration.",
            groups: [
                {
                    id: "questcord-notifications",
                    title: "Toasts",
                    fields: [
                        field(
                            "showNotifications",
                            "Show notifications",
                            "Display toast notifications for quest events.",
                            "Errors and important state changes are suppressed when this is off."
                        ),
                        field(
                            "notificationDuration",
                            "Duration",
                            "How long notifications stay on screen.",
                            "Measured in seconds. Short durations are harder to notice during long quests.",
                            { width: "full" }
                        ),
                        field(
                            "pillShowTimer",
                            "Show timer",
                            "Show elapsed time on the active progress pill.",
                            "The timer stops when the quest finishes and is hidden on completed pills."
                        ),
                        field(
                            "pillMaxStack",
                            "Stack limit",
                            "Maximum number of sub pills visible at once.",
                            "Older notifications are dismissed first when the limit is reached."
                        ),
                    ],
                },
            ],
        },
        {
            id: "quest-extras",
            title: "Quest Extras",
            description: "Optional enrollment, claiming, console, task and history features.",
            groups: [
                {
                    id: "questcord-extras-automation",
                    title: "Optional automation",
                    description:
                        "All default to off. Manual controls remain available on quest tiles.",
                    fields: [
                        field(
                            "autoEnrollQuests",
                            "Auto enroll",
                            "Proactively enroll in compatible active quests.",
                            "Off keeps the manual queue workflow. On enrolls eligible quests immediately, then queues them for completion."
                        ),
                        field(
                            "rewardClaimMode",
                            "Reward claiming",
                            "Claim completed quest rewards automatically or manually.",
                            "Off leaves claiming to Discord. Manual exposes a claim action; auto claims in the background and respects Discord's verification."
                        ),
                        field(
                            "consoleQuestMode",
                            "Console quests",
                            "Track linked Xbox/PlayStation quests.",
                            "Off skips console quests. Requires a real linked account and the actual game; automation cannot play for you."
                        ),
                        field(
                            "autoResolveTasks",
                            "AND/OR tasks",
                            "Resolve AND/OR quest task groups automatically.",
                            "Skips unsupported tasks and picks the next runnable objective when Discord groups tasks."
                        ),
                        field(
                            "captchaClaimBehavior",
                            "Verification handling",
                            "How claim attempts react to Discord verification prompts.",
                            "Questcord never reads or solves challenge values."
                        ),
                        field(
                            "trackQuestHistory",
                            "Quest history",
                            "Keep a local count and history of confirmed completions.",
                            "Stored locally in Vencord's data store, never sent anywhere."
                        ),
                    ],
                },
                {
                    id: "questcord-extras-history",
                    title: "History",
                    description: "Locally recorded quest completions.",
                    render: QuestHistory,
                },
            ],
        },
        {
            id: "advanced",
            title: "Advanced",
            description: "Queue lanes, concurrency and optional integrations.",
            groups: [
                {
                    id: "questcord-lanes",
                    title: "Queue lanes",
                    fields: [
                        field(
                            "queuePreference",
                            "Queue priority",
                            "Which quest kind the queue considers first.",
                            "Game and video lanes still run independently; this only changes which queued item is picked first."
                        ),
                        field(
                            "gameConcurrency",
                            "Game concurrency",
                            "Maximum concurrent game quests.",
                            "Discord only tracks one game at a time, so values above 1 rarely help.",
                            { width: "half" }
                        ),
                        field(
                            "videoConcurrency",
                            "Video concurrency",
                            "Maximum concurrent video quests.",
                            "Default 1 means one game plus one video. Values up to 4 are supported.",
                            { width: "half" }
                        ),
                    ],
                },
                {
                    id: "questcord-integrations",
                    title: "Integrations",
                    fields: [
                        field(
                            "enableAchievementBypass",
                            "Achievement bypass",
                            "Enable achievement-in-activity quest bypass via OAuth.",
                            "Security-sensitive opt-in. Requires a local relay server on 127.0.0.1:43210 and stays off until you explicitly enable it.",
                            { badge: "Opt-in", badgeTone: "danger", width: "full" }
                        ),
                    ],
                },
                {
                    id: "questcord-maintenance",
                    title: "Maintenance",
                    description:
                        "All reset actions ask for confirmation before changing saved values.",
                    actions: [
                        {
                            id: "reset-design",
                            label: "Reset customization",
                            description: "Restore the original pill position, colors and geometry.",
                            info: "Only Design settings are changed; automation, queue and notification settings stay as they are.",
                            variant: "secondary",
                            run: () =>
                                resetSettingKeys(settings, definition.definition, DESIGN_KEYS),
                        },
                        {
                            id: "reset-all",
                            label: "Reset all settings",
                            description: "Restore every Questcord setting to its shipped default.",
                            info: "This does not delete saved quests or queue entries. Use Clear saved quests separately.",
                            variant: "dangerSecondary",
                            run: () => resetSettingKeys(settings, definition.definition, ALL_KEYS),
                        },
                    ],
                },
            ],
        },
        {
            id: "developer",
            title: "Developer",
            description: "Debug logging, foundation diagnostics and saved-state cleanup.",
            groups: [
                {
                    id: "questcord-diagnostics",
                    title: "Diagnostics",
                    fields: [
                        field(
                            "debugMode",
                            "Debug mode",
                            "Enable detailed Questcord logging in the console.",
                            "Use this when reporting a problem. It can produce a lot of output during long quests."
                        ),
                        field(
                            "foundationDiagnosticsEnabled",
                            "Foundation diagnostics",
                            "Record and log foundation diagnostic events.",
                            "Records lifecycle and bridge events. This does not change quest behavior."
                        ),
                        field(
                            "foundationLogLevel",
                            "Log level",
                            "Minimum severity written to the Vencord log.",
                            "Warn is the shipped default. Debug is only useful together with diagnostic reporting.",
                            { width: "full" }
                        ),
                        field(
                            "foundationBridgeEnabled",
                            "Foundation bridge",
                            "Allow registration with the optional plugin bridge.",
                            "Off by default. Questcord works without any other plugin.",
                            { badge: "Off by default", width: "full" }
                        ),
                    ],
                },
                {
                    id: "questcord-saved-state",
                    title: "Saved state",
                    actions: [
                        {
                            id: "clear-saved-quests",
                            label: "Clear saved quests",
                            description: "Delete persisted resume state for active quests.",
                            info: "Useful after Discord changes quest availability. The queue itself is not cleared.",
                            variant: "dangerSecondary",
                            run: () => {
                                void clearSavedQuestStates()
                                    .then(() =>
                                        notify(
                                            "Cleared",
                                            "Saved quest resume states cleared",
                                            "info"
                                        )
                                    )
                                    .catch(() =>
                                        notify("Error", "Could not clear saved quests", "error")
                                    );
                            },
                        },
                    ],
                },
                {
                    id: "questcord-patch-status",
                    title: "Patch status",
                    description: "Load-time match status for every manifest patch.",
                    render: () => (
                        <FoundationPatchStatus
                            manifest={patchManifest}
                            pluginName="Questcord"
                            version={PLUGIN_VERSION}
                        />
                    ),
                },
                {
                    id: "questcord-log-viewer",
                    title: "Log viewer",
                    description: "Recent FoundationLogger entries with a level filter.",
                    render: FoundationLogViewer,
                },
            ],
        },
        {
            id: "about",
            title: "About",
            description: "Version, foundation and author information.",
            groups: [
                {
                    id: "questcord-about",
                    title: "Questcord",
                    render: QuestAbout,
                },
            ],
        },
    ],
};

export function QuestcordUnifiedSettings() {
    return <SettingsApp config={config} />;
}
