import { Button, Popout, React } from "@webpack/common";

import { getEntries, getVersion, subscribe } from "../quests/queue/store";
import { QueuePanel } from "./QueuePanel";
import { t } from "./i18n";

/**
 * Header "Queue (N)" button next to Suggested/Filters on the quests page.
 * Opens a popout with the full queue panel. Hidden while the queue is empty so
 * it does not clutter the quest list.
 */
export function QueueButton() {
    const anchorRef = React.useRef<HTMLDivElement>(null);
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
                    <Button
                        {...props}
                        size={Button.Sizes.SMALL}
                        color={Button.Colors.PRIMARY}
                        aria-label={t("queueAria")}
                    >
                        {t("queueCount", { count })}
                    </Button>
                )}
            </Popout>
        </div>
    );
}
