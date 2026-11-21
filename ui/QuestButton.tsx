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
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Button, type ButtonVariant } from "@components/Button";
import { React, UserStore } from "@webpack/common";

import { settings } from "../settings";
import { type Quest } from "../core/types";
import { cancelQuest, isLaneRunning, isRunning, startQuest } from "../quests/manager";
import {
    getUnsupportedQuestReason,
    isEnrolled,
    isQueueable,
    kindOf,
    pickTask,
} from "../quests/queue/order";
import { getRows, toggleQueued } from "../quests/queue/runner";
import { isEnrollmentRequested } from "../quests/enrollmentMemory";
import { getVersion, isQueued, subscribe } from "../quests/queue/store";
import { t } from "./i18n";
import { createScopedLogger } from "../foundation/core/logging";

const log = createScopedLogger("ui/QuestButton");

export function QuestButton({ quest }: { quest: Quest }) {
    const queueVersion = React.useSyncExternalStore(subscribe, getVersion);
    const preference = (settings.use(["queuePreference" as never]) as { queuePreference?: string })
        .queuePreference;

    // discord mutates quest progress outside react, so the state has to be polled
    const [, forceTick] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => {
        const interval = setInterval(forceTick, 500);
        return () => clearInterval(interval);
    }, []);

    void queueVersion;
    void preference;

    const unsupportedReason = getUnsupportedQuestReason(quest);
    const unsupported =
        unsupportedReason != null &&
        !(
            unsupportedReason === "achievement-in-activity" &&
            settings.store.enableAchievementBypass
        );

    if (unsupported) {
        return (
            <Button
                className="vc-questcord-tile-btn vc-questcord-unsupported-btn"
                style={{ width: "100%", minWidth: 0 }}
                variant="secondary"
                size="medium"
                disabled
                title={t(
                    unsupportedReason === "achievement-in-game"
                        ? "unsupportedAchievementInGame"
                        : "unsupportedAchievementBypassOff"
                )}
            >
                {t("unsupported")}
            </Button>
        );
    }

    if (!isQueueable(quest)) return null;

    const questId = quest.id;
    const running = isRunning(questId);
    const queued = isQueued(questId);
    const enrolled = isEnrolled(quest) || isEnrollmentRequested(questId);
    const lane = kindOf(pickTask(quest)!);
    // A game quest must not push a video into the queue or vice versa. Each
    // lane gets its first auto-complete; only the next quest in that lane queues.
    const laneBusy =
        isLaneRunning(lane) ||
        getRows().some((row) => row.kind === lane && row.entry.questId !== questId);

    // One button per tile; unaccepted quests must be started via Discord's own button first.
    let variant: ButtonVariant = "primary";
    let label = t("autoComplete");
    let title: string | undefined;
    let onClick: (() => void) | undefined = () =>
        void startQuest(questId).catch((err) => log.warn("startQuest failed:", err));

    if (running) {
        variant = "primary";
        label = t("cancel");
        onClick = () => {
            const userId = UserStore.getCurrentUser()?.id;
            if (userId) cancelQuest(questId, userId);
        };
    } else if (queued) {
        variant = "secondary";
        label = t("queued");
        title = t("removeFromQueue");
        onClick = () => toggleQueued(questId);
    } else if (!enrolled) {
        // Auto-enroll runs on its own, but the tile can also start an eligible
        // quest directly. Discord's native accept flow is used in that case.
        variant = "secondary";
        label = t("autoComplete");
    } else if (laneBusy) {
        variant = "secondary";
        label = t("addToQueue");
        onClick = () => toggleQueued(questId);
    }

    return (
        <Button
            className="vc-questcord-tile-btn"
            style={{ width: "100%", minWidth: 0 }}
            variant={variant}
            size="medium"
            title={title}
            disabled={!onClick}
            onClick={onClick}
        >
            {label}
        </Button>
    );
}
