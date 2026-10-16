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

import { LOG_PREFIX } from "../constants";
import { debugLog, isPluginStopping } from "../core/state";
import { settings } from "../settings";

let questVideoObserver: MutationObserver | null = null;

export function setupQuestVideoAutoDismiss() {
    cleanupQuestVideoDismiss();
    questVideoObserver = new MutationObserver(() => {
        if (isPluginStopping) return;
        tryDismissQuestVideo();
    });
    // quest popups mount at varying depths under body, watch the whole subtree
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

            // discord's popup copy, it changes with releases, so match loosely
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
