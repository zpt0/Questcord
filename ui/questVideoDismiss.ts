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
        document.querySelectorAll("[data-questcord-btn]").forEach((btn) => {
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

// discord's popup copy changes with releases and locales, match loosely on QR + video keywords
const MOBILE_POPUP_KEYWORDS: readonly string[] = [
    // English
    "continue on your phone",
    "scan this qr code",
    "continue the quest on your mobile",
    "quest on your mobile",
    // German
    "auf deinem handy",
    "qr-code",
    "scanne diesen qr",
    "quest auf deinem handy",
    // French
    "sur votre téléphone",
    "scannez ce qr",
    "quest sur votre téléphone",
    // Spanish
    "en tu teléfono",
    "escanea este qr",
    "quest en tu teléfono",
    // Italian
    "sul tuo telefono",
    "scansiona questo qr",
    // Portuguese
    "no seu celular",
    "digitalize este qr",
    // Russian
    "на телефоне",
    "отсканируйте qr",
    // Japanese
    "携帯",
    "qr",
    // Korean
    "휴대폰",
    "qr",
    // Chinese
    "手机",
    "二维码",
];

function tryDismissQuestVideo() {
    try {
        if (!settings.store.autoDismissQuestPopups) return;
        const candidates = document.querySelectorAll(
            "[class*='layerContainer'] [class*='layer'], [class*='modal'], [class*='backdrop'], [role='dialog']"
        );

        for (const layer of Array.from(candidates)) {
            const text = (layer as HTMLElement).textContent ?? "";
            const lower = text.toLowerCase();

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

            // match any mobile popup keyword (locale-agnostic)
            const isMobilePopup = MOBILE_POPUP_KEYWORDS.some((kw) => lower.includes(kw));
            if (isMobilePopup) {
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

const CLOSE_LABELS: readonly string[] = [
    "Close",
    "Schließen",
    "Fermer",
    "Chiudere",
    "Fechar",
    "Zamknąć",
    "閉じる",
    "关闭",
    "cerrar",
    "x",
];

const CLOSE_TEXTS: readonly string[] = [
    "✕",
    "×",
    "╳",
    "done",
    "ok",
    "cancel",
    "abbruch",
    "annuler",
    "annulla",
    "cancelar",
    "отмена",
    "キャンセル",
    "取り消し",
    "취소",
    "取消",
    "fermer",
    "zamknij",
    "cerrar",
    "chiudi",
    "fechar",
    "閉じる",
    "关闭",
];

function findCloseButton(container: Element): HTMLElement | null {
    for (const label of CLOSE_LABELS) {
        const el = container.querySelector(`[aria-label='${label}']`) as HTMLElement;
        if (el) return el;
    }

    const classSelectors = [
        "[class*='closeButton']",
        "[class*='close-btn']",
        "[class*='dismiss']",
        "[class*='cross']",
        "[class*='exit']",
        "[class*='close']",
    ];
    for (const sel of classSelectors) {
        const el = container.querySelector(sel) as HTMLElement;
        if (el) return el;
    }

    const buttons = Array.from(container.querySelectorAll("button"));
    for (const b of buttons) {
        const label = (b.getAttribute("aria-label") || "").toLowerCase();
        const text = (b.textContent || "").trim().toLowerCase();
        for (const cl of CLOSE_LABELS) {
            if (label.includes(cl.toLowerCase())) return b as HTMLElement;
        }
        for (const ct of CLOSE_TEXTS) {
            if (text === ct.toLowerCase()) return b as HTMLElement;
        }
    }

    return null;
}
