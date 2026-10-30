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
import { Popout, React } from "@webpack/common";

import { getEntries, getVersion, subscribe } from "../quests/queue/store";
import { QueuePanel } from "./QueuePanel";
import { t } from "./i18n";

export function QueueButton() {
    const anchorRef = React.useRef<HTMLDivElement>(null);
    // return value unused, this only subscribes so the button re-renders
    React.useSyncExternalStore(subscribe, getVersion);

    const count = getEntries().length;

    if (count === 0) return null;

    return (
        <div ref={anchorRef} className="vc-questcord-queue-button-anchor">
            <Popout
                position="bottom"
                align="right"
                targetElementRef={anchorRef}
                renderPopout={() => <QueuePanel />}
            >
                {(props: Record<string, any>) => (
                    <Button {...props} size="small" variant="secondary" aria-label={t("queueAria")}>
                        {t("queueCount", { count })}
                    </Button>
                )}
            </Popout>
        </div>
    );
}
