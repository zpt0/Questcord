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
