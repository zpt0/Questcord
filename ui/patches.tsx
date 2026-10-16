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

/* eslint-disable no-useless-escape -- the \i placeholder in Discord's minified matchers is intentional */

import type { Quest } from "../core/types";
import { ErrorBoundary } from "./ErrorBoundary";
import { QuestButton } from "./QuestButton";
import { QueueButton } from "./QueueButton";
import { isQueueable } from "../quests/queue/order";

export const questPatches = [
    // wrap discord's tile footer renderer instead of replacing it, discord's own layout has to stay
    {
        find: ".QUEST_HOME_TILE_FOOTER,analyticsCtxQuestContent",
        replacement: {
            match: /function (\i)\((\i)\)\{(let\{quest:\i,questContent:\i,contentPosition:\i,rowIndex:\i,sourceQuestContent:\i\}=\i,\i=\(0,\i\.\i\)\(\i\),\{isQuestEnrollmentBlocked:\i\}=\(0,\i\.\i\)\(\[\i\.\i\],\(\)=>\(\{isQuestEnrollmentBlocked:null!=\i\.\i\.questEnrollmentBlockedUntil\}\)\);return )/,
            replace:
                "function $1($2){return $self.renderFooter($2,$1Original)}function $1Original($2){$3",
        },
    },
    {
        // the queue button is injected right after the quest filter pills
        find: /\(0,\i\.jsx\)\(\i,\{onChange:\i,selectedFilters:\i\}\)\]/,
        replacement: {
            match: /(\(0,\i\.jsx\)\(\i,\{onChange:\i,selectedFilters:\i\}\))\]/,
            replace: "$1,$self.renderQueueButton()]",
        },
    },
    {
        // v2 tiles render their footer separately, so the button is appended after it
        find: ".QUEST_HOME_TILE_V2_FOOTER,analyticsCtxQuestContent",
        noWarn: true,
        replacement: {
            match: /(!\i&&!\i&&\(0,\i\.jsx\)\(\i\.\i,\{quest:(\i),surface:\i\.\i\.QUEST_HOME_TILE_V2_FOOTER,[^}]+\}\)),/,
            replace: "$1,$self.renderQuestButton($2),",
        },
    },
] as any[];

export function renderFooter(props: { quest?: Quest }, Footer: React.ComponentType<any>) {
    // inline styles on purpose: vencord's managed stylesheet may not be mounted yet
    return (
        <div className="vc-questcord-footer" style={{ width: "100%" }}>
            <Footer {...props} />
            {isQueueable(props?.quest) && (
                <div
                    className="vc-questcord-footer-row"
                    style={{
                        display: "flex",
                        boxSizing: "border-box",
                        width: "100%",
                        marginTop: -4,
                        padding: "0 12px 12px",
                    }}
                >
                    <ErrorBoundary>
                        <QuestButton quest={props.quest!} />
                    </ErrorBoundary>
                </div>
            )}
        </div>
    );
}

export function renderQuestButton(quest: Quest) {
    return (
        <ErrorBoundary>
            <QuestButton quest={quest} />
        </ErrorBoundary>
    );
}

export function renderQueueButton() {
    return (
        <ErrorBoundary>
            <QueueButton />
        </ErrorBoundary>
    );
}
