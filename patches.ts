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

/* eslint-disable no-useless-escape -- \i is Vencord's identifier token in patch regexes */

import { definePatchManifest } from "./foundation";

/**
 * The original Questcord UI patches, expressed through the copied foundation
 * manifest. Find strings, regexes, replacements, and noWarn flags are
 * byte-for-byte preserved.
 */
export const patchManifest = definePatchManifest([
    {
        id: "quest-home-tile-footer",
        description: "Wrap Discord's quest tile footer so the queue button can be injected",
        module: "QuestHomeTileFooter",
        patch: {
            find: ".QUEST_HOME_TILE_FOOTER,analyticsCtxQuestContent",
            replacement: {
                match: /function (\i)\((\i)\)\{(let\{quest:\i,questContent:\i,contentPosition:\i,rowIndex:\i,sourceQuestContent:\i\}=\i,\{shorterHeight:\i\}=\i\.useContext\(\i\.f\),\i=\(0,\i\.\i\)\(\i\),\{isQuestEnrollmentBlocked:\i\}=\(0,\i\.\i\)\(\[\i\.\i\])/,
                replace:
                    "function $1($2){return $self.renderFooter($2,$1Original)}function $1Original($2){$3",
            },
        },
        expectations: {
            find: { min: 1, max: 1 },
            replacements: { min: 1, max: 1 },
        },
    },
    {
        id: "quest-filter-queue-button",
        description: "Append the queue button after Discord's quest filter pills",
        module: "QuestFilterPills",
        patch: {
            find: /\(0,\i\.jsx\)\(\i,\{onChange:\i,selectedFilters:\i\}\)\]/,
            replacement: {
                match: /(\(0,\i\.jsx\)\(\i,\{onChange:\i,selectedFilters:\i\}\))\]/,
                replace: "$1,$self.renderQueueButton()]",
            },
        },
        expectations: {
            find: { min: 1, max: 1 },
            replacements: { min: 1, max: 1 },
        },
    },
    {
        id: "quest-home-tile-v2-footer",
        description: "Append the queue button to v2 quest tiles",
        module: "QuestHomeTileV2Footer",
        patch: {
            find: ".QUEST_HOME_TILE_V2_FOOTER,analyticsCtxQuestContent",
            noWarn: true,
            replacement: {
                match: /(!\i&&!\i&&\(0,\i\.jsx\)\(\i\.\i,\{quest:(\i),surface:\i\.\i\.QUEST_HOME_TILE_V2_FOOTER,[^}]+\}\)),/,
                replace: "$1,$self.renderQuestButton($2),",
            },
        },
        expectations: {
            find: { min: 1 },
            replacements: { min: 1 },
        },
        noWarnReason:
            "Discord ships both v1 and v2 quest tile layouts across clients; one of the optional tile patches is expected to miss.",
    },
    {
        id: "quest-home-tile-footer-generic",
        description: "Append the queue button to generic v3+ quest tiles",
        module: "QuestHomeTileFooterGeneric",
        patch: {
            find: ".QUEST_HOME_TILE_FOOTER",
            noWarn: true,
            replacement: {
                match: /(\(0,\i\.jsx\)\(\i\.\i,\{quest:(\i),surface:\i\.\i\.QUEST_HOME_TILE_FOOTER,[^}]+\}\)),/,
                replace: "$1,$self.renderQuestButton($2),",
            },
        },
        expectations: {
            find: { min: 1 },
            replacements: { min: 1 },
        },
        noWarnReason:
            "Newer Discord clients may remove this generic footer render entirely; the v1/v2 patches remain authoritative.",
    },
]);
