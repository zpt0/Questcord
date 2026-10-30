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

import { Button } from "@components/Button";
import { Switch } from "@components/Switch";
import { React, UserStore } from "@webpack/common";

import { getQuestName } from "../core/types";
import { cancelQuest, getRunningPercent } from "../quests/manager";
import type { QueuePreference, QueueRow } from "../quests/queue/order";
import { sortRows } from "../quests/queue/order";
import { getPreference, getRows, isQueueEnabled, setQueueEnabled } from "../quests/queue/runner";
import {
    clearQueue,
    getVersion as getQueueVersion,
    isAccepting,
    removeFromQueue,
    subscribe as subscribeQueue,
} from "../quests/queue/store";
import { settings } from "../settings";
import { t } from "./i18n";

function subtitleOf(row: QueueRow): string {
    const title = row.quest ? getQuestName(row.quest, row.entry.questId) : row.entry.questId;
    if (row.task == null) return title;
    return `${title} · ${row.kind === "video" ? t("videos") : t("games")}`;
}

function stateOf(row: QueueRow, enabled: boolean): string {
    switch (row.state) {
        case "running": {
            const percent = getRunningPercent(row.entry.questId);
            return t("statusRunning", { percent: percent != null ? ` ${percent}%` : "" });
        }
        case "ready":
        case "needs-accept":
            if (!enabled) return t("paused");
            return isAccepting(row.entry.questId) ? t("statusAccepting") : t("statusWaiting");
        default:
            return t("statusUnavailable");
    }
}

function statusLine(rows: QueueRow[], enabled: boolean): string {
    if (!enabled) return t("paused");
    if (rows.some((row) => row.state === "running")) return t("collecting");
    return rows.length === 0 ? t("nothingToRun") : t("gettingReady");
}

function cancelRunningQuest(questId: string) {
    const userId = UserStore.getCurrentUser()?.id;
    if (userId) cancelQuest(questId, userId);
}

function QueueRowView({ row, enabled }: { row: QueueRow; enabled: boolean }) {
    const name = row.quest ? getQuestName(row.quest, row.entry.questId) : row.entry.questId;
    const running = row.state === "running";

    return (
        <div className="vc-questcord-queue-row">
            <div className="vc-questcord-queue-row-info">
                <span className="vc-questcord-queue-row-title">{name}</span>
                <span className="vc-questcord-queue-row-subtitle">{subtitleOf(row)}</span>
            </div>
            <span className="vc-questcord-queue-row-state">{stateOf(row, enabled)}</span>
            <Button
                className="vc-questcord-queue-row-btn"
                size="small"
                variant={running ? "dangerPrimary" : "secondary"}
                aria-label={running ? t("cancel") : t("remove")}
                onClick={() => {
                    if (running) {
                        cancelRunningQuest(row.entry.questId);
                        removeFromQueue(row.entry.questId);
                    } else {
                        removeFromQueue(row.entry.questId);
                    }
                }}
            >
                {running ? t("cancel") : t("remove")}
            </Button>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="vc-questcord-queue-empty">
            <span className="vc-questcord-queue-empty-title">{t("noQuestsTitle")}</span>
            <span className="vc-questcord-queue-empty-hint">{t("noQuestsHint")}</span>
        </div>
    );
}

const ORDER_OPTIONS: Array<{ value: QueuePreference }> = [{ value: "videos" }, { value: "games" }];

const PANEL_STYLE: React.CSSProperties = {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    width: 340,
    maxWidth: "calc(100vw - 32px)",
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
    background: "var(--background-floating, var(--background-secondary, #2b2d31))",
    boxShadow: "var(--shadow-high, 0 8px 16px rgba(0, 0, 0, 0.25))",
    color: "var(--text-default, #f2f3f5)",
};

const HEADING_STYLE: React.CSSProperties = {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.02em",
    color: "var(--text-subtle, var(--text-muted, #949ba4))",
};

const LIST_STYLE: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    maxHeight: 260,
    overflowY: "auto",
    paddingRight: 4,
};

const INLINE_STYLE: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
};

export function QueuePanel({ inline = false }: { inline?: boolean } = {}) {
    const queueVersion = React.useSyncExternalStore(subscribeQueue, getQueueVersion);
    const preference = (settings.use(["queuePreference" as never]) as { queuePreference?: string })
        .queuePreference;

    const [, forceTick] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => {
        // running % is not in the store, poll it so the row updates
        const interval = setInterval(forceTick, 1000);
        return () => clearInterval(interval);
    }, []);

    // value unused on purpose, subscribing to the store is what redraws
    void queueVersion;

    const enabled = isQueueEnabled();
    const rows = sortRows(getRows(), getPreference());

    return (
        <div className="vc-questcord-queue-panel" style={inline ? INLINE_STYLE : PANEL_STYLE}>
            <div className="vc-questcord-queue-head">
                {inline ? (
                    <span className="vc-questcord-queue-head-status">
                        {statusLine(rows, enabled)}
                    </span>
                ) : (
                    <div className="vc-questcord-queue-head-text">
                        <span className="vc-questcord-queue-head-title">
                            {rows.length > 0 ? t("queueCount", { count: rows.length }) : t("queue")}
                        </span>
                        <span className="vc-questcord-queue-head-status">
                            {statusLine(rows, enabled)}
                        </span>
                    </div>
                )}
                <Switch checked={enabled} onChange={(value: boolean) => setQueueEnabled(value)} />
            </div>

            <span className="vc-questcord-queue-heading" style={HEADING_STYLE}>
                {t("runFirst")}
            </span>
            <div className="vc-questcord-queue-segments">
                {ORDER_OPTIONS.map((option) => {
                    const optionLabel = option.value === "videos" ? t("videos") : t("games");
                    return (
                        <Button
                            key={option.value}
                            size="small"
                            variant={preference === option.value ? "primary" : "secondary"}
                            onClick={() => {
                                (settings.store as { queuePreference?: string }).queuePreference =
                                    option.value;
                                forceTick();
                            }}
                        >
                            {optionLabel}
                        </Button>
                    );
                })}
            </div>

            <span className="vc-questcord-queue-heading" style={HEADING_STYLE}>
                {t("questsCount", { count: rows.length })}
            </span>
            {rows.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="vc-questcord-queue-list" style={LIST_STYLE}>
                    {rows.map((row) => (
                        <QueueRowView key={row.entry.questId} row={row} enabled={enabled} />
                    ))}
                    <Button
                        size="small"
                        variant="secondary"
                        className="vc-questcord-queue-clear"
                        onClick={() => clearQueue()}
                    >
                        {t("clearQueue")}
                    </Button>
                </div>
            )}
        </div>
    );
}
