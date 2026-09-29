import { Forms, React, Switch } from "@webpack/common";
import { settings } from "../settings";
import { QuestsStore } from "../core/stores";
import { getQuestName } from "../core/types";
import { suppressConsole, restoreConsole } from "../core/utils";
import { getRows, getPreference, setQueueEnabled, isQueueEnabled } from "../quests/queue/runner";
import { clearQueue, getVersion, removeFromQueue, subscribe } from "../quests/queue/store";
import { notify } from "../ui/notifications";

function safeQuestName(questId: string): string {
    try {
        const orig = suppressConsole("log", "warn", "error");
        try {
            const quest = QuestsStore?.getQuest?.(questId);
            if (quest) return getQuestName(quest, questId);
        } finally {
            restoreConsole(orig);
        }
    } catch {}
    return questId;
}

export function QueueSettings() {
    const version = React.useSyncExternalStore(subscribe, getVersion);
    void version;
    const queueOn = React.useSyncExternalStore(
        (cb) => subscribe(cb),
        () => (isQueueEnabled() ? 1 : 0)
    );
    const preference =
        (settings.use(["queuePreference" as never]) as { queuePreference?: string })
            .queuePreference ?? getPreference();
    const rows = getRows();

    return (
        <Forms.FormSection title={`Quest Queue (${rows.length})`}>
            <Forms.FormText style={{ marginBottom: 8 }}>
                Queue quests from any quest tile with + Queue. The queue accepts and completes them
                one at a time, videos and games can be prioritized.
            </Forms.FormText>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <Switch
                    checked={queueOn === 1}
                    onChange={(v: boolean) => {
                        setQueueEnabled(v);
                        notify("Queue", v ? "Queue enabled" : "Queue paused", "info");
                    }}
                />
                <Forms.FormText>Run queued quests automatically</Forms.FormText>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button
                    className="vc-questcord-settings-check-update-btn"
                    style={{
                        flex: 1,
                        opacity: preference === "videos" ? 1 : 0.6,
                    }}
                    onClick={() => {
                        (settings.store as { queuePreference?: string }).queuePreference = "videos";
                    }}
                >
                    Videos first
                </button>
                <button
                    className="vc-questcord-settings-check-update-btn"
                    style={{ flex: 1, opacity: preference === "games" ? 1 : 0.6 }}
                    onClick={() => {
                        (settings.store as { queuePreference?: string }).queuePreference = "games";
                    }}
                >
                    Games first
                </button>
            </div>
            {rows.length === 0 ? (
                <Forms.FormText>No quests queued yet.</Forms.FormText>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {rows.map((row) => (
                        <div
                            key={row.entry.questId}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 8px",
                                borderRadius: 6,
                                background: "var(--background-mod-subtle)",
                            }}
                        >
                            <div
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {safeQuestName(row.entry.questId)}
                            </div>
                            <span style={{ fontSize: 12, opacity: 0.8 }}>{row.state}</span>
                            <button
                                className="vc-questcord-settings-check-update-btn"
                                onClick={() => removeFromQueue(row.entry.questId)}
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                    <button
                        className="vc-questcord-settings-check-update-btn"
                        style={{ marginTop: 4 }}
                        onClick={() => {
                            clearQueue();
                            notify("Queue", "Queue cleared", "info");
                        }}
                    >
                        Clear Queue
                    </button>
                </div>
            )}
        </Forms.FormSection>
    );
}
