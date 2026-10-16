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

import { Forms } from "@webpack/common";

import { QueuePanel } from "../ui/QueuePanel";

/**
 * Queue section of the plugin settings. Renders the shared queue panel in its
 * inline variant so it blends into the regular settings sections.
 */
export function QueueSettings() {
    return (
        <Forms.FormSection title="Queue">
            <QueuePanel inline />
        </Forms.FormSection>
    );
}
