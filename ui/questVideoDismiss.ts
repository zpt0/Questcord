import { LOG_PREFIX } from "../constants";
import { debugLog, isPluginStopping } from "../core/state";
import { settings } from "../settings";

/**
 * MutationObserver-only UI helper: automatically dismisses quest promo video
 * popups and mobile QR code modals. The classic DOM button injection
 * ("Auto Complete" / "+ Queue") was replaced by React patch-based components
 * (ui/QuestButton.tsx, ui/QueueButton.tsx).
 */

let questVideoObserver: MutationObserver | null = null;

export function setupQuestVideoAutoDismiss() {
    cleanupQuestVideoDismiss();
    questVideoObserver = new MutationObserver(() => {
        if (isPluginStopping) return;
        tryDismissQuestVideo();
    });
    questVideoObserver.observe(document.body, { childList: true, subtree: true });
}

export function cleanupQuestVideoDismiss() {
    if (questVideoObserver) {
        try {
            questVideoObserver.disconnect();
        } catch (e) {
            debugLog(`${LOG_PREFIX} Failed to disconnect video observer:`, e);
        }
        questVideoObserver = null;
    }
    cleanupInjectedButtons();
}

function cleanupInjectedButtons() {
    // Defensive cleanup for users upgrading from the DOM-injection build.
    try {
        document.querySelectorAll("[data-quest-autocomplete-btn]").forEach((btn) => {
            try {
                btn.remove();
            } catch {}
        });
        document.querySelectorAll("[data-questcord-queue-btn]").forEach((btn) => {
            try {
                btn.remove();
            } catch {}
        });
    } catch {}
}

function tryDismissQuestVideo() {
    try {
        if (!settings.store.autoDismissQuestPopups) return;
        const candidates = document.querySelectorAll(
            "[class*='layerContainer'] [class*='layer'], [class*='modal'], [class*='backdrop'], [role='dialog']"
        );

        for (const layer of Array.from(candidates)) {
            const text = (layer as HTMLElement).textContent ?? "";

            const video = layer.querySelector("video");
            if (video) {
                const src = video.src || video.currentSrc || "";
                const isQuestVideo =
                    src.includes("cdn.discordapp.com/quests") ||
                    layer.querySelector("[class*='questContent'], [class*='quest']") !== null;
                if (isQuestVideo) {
                    const closeBtn = findCloseButton(layer);
                    if (closeBtn) {
                        debugLog(`${LOG_PREFIX} Auto-dismissing quest video popup`);
                        closeBtn.click();
                        return;
                    }
                }
            }

            if (
                text.includes("Continue on your phone") ||
                text.includes("Scan this QR code") ||
                text.includes("continue the Quest on your mobile")
            ) {
                const closeBtn = findCloseButton(layer);
                if (closeBtn) {
                    debugLog(`${LOG_PREFIX} Auto-dismissing mobile QR code popup`);
                    closeBtn.click();
                    return;
                }
            }
        }
    } catch (e) {
        debugLog(`${LOG_PREFIX} Video dismiss error:`, e);
    }
}

function findCloseButton(container: Element): HTMLElement | null {
    return (
        (container.querySelector("[aria-label='Close']") as HTMLElement) ||
        (container.querySelector("[class*='closeButton']") as HTMLElement) ||
        (Array.from(container.querySelectorAll("button")).find(
            (b) =>
                b.getAttribute("aria-label")?.toLowerCase().includes("close") ||
                b.textContent?.trim() === "✕" ||
                b.textContent?.trim() === "×" ||
                b.textContent?.trim() === "╳"
        ) as HTMLElement | undefined) ||
        null
    );
}
