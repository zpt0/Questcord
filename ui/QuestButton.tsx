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

import { Button, React, UserStore } from "@webpack/common";

import { settings } from "../settings";
import { type Quest } from "../core/types";
import { cancelQuest, isAnyRunning, isRunning, startQuest } from "../quests/manager";
import { isEnrolled, isQueueable } from "../quests/queue/order";
import { toggleQueued } from "../quests/queue/runner";
import { getEntries, getVersion, isQueued, subscribe } from "../quests/queue/store";
import { t } from "./i18n";

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

    if (!isQueueable(quest)) return null;

    const questId = quest.id;
    const running = isRunning(questId);
    const queued = isQueued(questId);
    const enrolled = isEnrolled(quest);
    const busy = isAnyRunning() || getEntries().length > 0;

    // one button per tile, the action depends on the state: not accepted quests are still
    // queueable, the queue accepts them itself once it runs
    let color = Button.Colors.BRAND;
    let label = t("autoComplete");
    let title: string | undefined;
    let onClick: () => void = () =>
        void startQuest(questId).catch((err) => console.warn("startQuest failed:", err));

    if (running) {
        color = Button.Colors.RED;
        label = t("cancel");
        onClick = () => {
            const userId = UserStore.getCurrentUser()?.id;
            if (userId) cancelQuest(questId, userId);
        };
    } else if (queued) {
        color = Button.Colors.PRIMARY;
        label = t("queued");
        title = t("removeFromQueue");
        onClick = () => toggleQueued(questId);
    } else if (!enrolled) {
        color = Button.Colors.PRIMARY;
        label = t("startQuestFirst");
        title = t("addToQueue");
        onClick = () => toggleQueued(questId);
    } else if (busy) {
        color = Button.Colors.PRIMARY;
        label = t("addToQueue");
        onClick = () => toggleQueued(questId);
    }

    return (
        <Button
            className="vc-questcord-tile-btn"
            style={{ width: "100%", minWidth: 0 }}
            color={color}
            size={Button.Sizes.MEDIUM}
            title={title}
            onClick={onClick}
        >
            {label}
        </Button>
    );
}
