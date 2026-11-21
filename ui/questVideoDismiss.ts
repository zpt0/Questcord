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
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { LOG_PREFIX } from "../constants";
import {
    cancelManagedInterval,
    createManagedInterval,
    createManagedMutationObserver,
    releaseManagedMutationObserver,
} from "../core/ownership";
import { debugLog, isPluginStopping } from "../core/state";
import { settings } from "../settings";

type DismissQueryRoot = Pick<Document, "querySelectorAll">;

export interface DismissSource {
    readonly root: DismissQueryRoot;
    readonly kind: "document" | "iframe" | "shadow";
}

let questVideoObserver: MutationObserver | null = null;
let questVideoPoll: ReturnType<typeof setInterval> | null = null;
let enrollmentDismissGraceUntil = 0;
let lastDismissLogSignature = "";
let lastDismissLogAt = 0;

/** Called after QUESTS_ENROLL_SUCCESS; allows dismissing the post-enroll popup. */
export function noteQuestEnrollment(): void {
    enrollmentDismissGraceUntil = Date.now() + 10_000;
}

/** Test/stop helper that restores the conservative default. */
export function resetQuestEnrollmentGuard(): void {
    enrollmentDismissGraceUntil = 0;
}

export function setupQuestVideoAutoDismiss() {
    cleanupQuestVideoDismiss();
    questVideoObserver = createManagedMutationObserver(() => {
        if (isPluginStopping) return;
        tryDismissQuestVideo();
    });
    // quest popups mount at varying depths under body, watch the whole subtree
    if (document.body) {
        questVideoObserver.observe(document.body, { childList: true, subtree: true });
    }
    // Safety net: Discord sometimes mounts the popup without a mutation we see,
    // or the store-gated start path may never install the observer at all.
    questVideoPoll = createManagedInterval(
        () => {
            if (isPluginStopping) return;
            tryDismissQuestVideo();
        },
        1000,
        "dismiss-poll"
    );
    // also catch a popup that was already open before the observer was installed
    tryDismissQuestVideo();
    debugLog(`${LOG_PREFIX} Quest popup observer installed`);
}

export function cleanupQuestVideoDismiss() {
    if (questVideoPoll) {
        cancelManagedInterval(questVideoPoll);
        questVideoPoll = null;
    }
    if (questVideoObserver) {
        try {
            questVideoObserver.disconnect();
        } catch (e) {
            debugLog(`${LOG_PREFIX} Failed to disconnect video observer:`, e);
        }
        releaseManagedMutationObserver(questVideoObserver);
        questVideoObserver = null;
    }
    cleanupInjectedButtons();
}

function collectDismissSources(doc: Document = document): DismissSource[] {
    const sources: DismissSource[] = [];
    const seen = new Set<object>();

    const addDocument = (target: Document, kind: DismissSource["kind"]) => {
        if (seen.has(target)) return;
        seen.add(target);
        sources.push({ root: target, kind });

        try {
            Array.from(target.querySelectorAll("iframe")).forEach((frame) => {
                try {
                    const frameDoc = (frame as HTMLIFrameElement).contentDocument;
                    if (frameDoc) addDocument(frameDoc, "iframe");
                } catch {}
            });
        } catch {}

        try {
            Array.from(target.querySelectorAll("*")).forEach((element) => {
                const shadow = (element as Element & { shadowRoot?: ShadowRoot }).shadowRoot;
                if (shadow) addShadow(shadow);
            });
        } catch {}
    };

    const addShadow = (root: ShadowRoot) => {
        if (seen.has(root)) return;
        seen.add(root);
        sources.push({ root, kind: "shadow" });

        try {
            Array.from(root.querySelectorAll("iframe")).forEach((frame) => {
                try {
                    const frameDoc = (frame as HTMLIFrameElement).contentDocument;
                    if (frameDoc) addDocument(frameDoc, "iframe");
                } catch {}
            });
        } catch {}

        try {
            Array.from(root.querySelectorAll("*")).forEach((element) => {
                const shadow = (element as Element & { shadowRoot?: ShadowRoot }).shadowRoot;
                if (shadow) addShadow(shadow);
            });
        } catch {}
    };

    addDocument(doc, "document");
    return sources;
}

function queryDismissControls(sources: readonly DismissSource[], selector: string): Element[] {
    const controls: Element[] = [];
    for (const { root } of sources) {
        try {
            controls.push(...Array.from(root.querySelectorAll(selector)));
        } catch {}
    }
    return controls;
}

function cleanupInjectedButtons() {
    try {
        const sources = collectDismissSources(document);
        queryDismissControls(sources, "[data-questcord-btn], [data-questcord-queue-btn]").forEach(
            (btn) => {
                try {
                    btn.remove();
                } catch {}
            }
        );
    } catch {}
}

/**
 * Only skip a layer that is itself a Vencord surface. `closest()` was too broad:
 * a Vencord wrapper anywhere above the popup made every Discord popup look
 * Vencord-owned, and the old descendant check also skipped popups containing
 * Questcord's injected quest-tile buttons.
 */
export function isVencordOwnedLayer(layer: Element): boolean {
    return layer.matches("[class*='vc-'], [data-vencord-owned]");
}

// Stable Discord test id for the ad/video modal close button:
// <button data-testid="ad-video-modal-close-btn" ... aria-label="Close">
const VIDEO_CLOSE_TESTID_SELECTOR = [
    "[data-testid='ad-video-modal-close-btn']",
    "[data-testid*='video-modal-close']",
    "[data-testid*='quest-video-close']",
].join(", ");

const POPUP_ROOT_SELECTOR = [
    "[data-mana-component='modal']",
    "[data-mana-component='popover']",
    "[data-mana-component='popout']",
    "[role='dialog']",
    "[class*='layerContainer'] [class*='layer']",
    "[class*='modal']",
    "[class*='backdrop']",
    "[class*='popout']",
    "[class*='popover']",
].join(", ");

// discord's popup copy changes with releases and locales, match loosely on QR + video keywords
const MOBILE_POPUP_KEYWORDS: readonly string[] = [
    // English
    "continue on your phone",
    "scan this qr code",
    "scan the qr code",
    "continue the quest on your mobile",
    "quest on your mobile",
    "qr code",
    // German
    "auf deinem handy",
    "qr-code",
    "qr code",
    "scanne den qr",
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
    "二维码",
    // Korean
    "휴대폰",
    // Chinese
    "手机",
];

const VIDEO_POPUP_KEYWORDS: readonly string[] = [
    "quest video",
    "watch video",
    "watch this video",
    "video quest",
    "video",
    "视频",
    "動画",
    "видео",
];

interface QuestPopupInfo {
    readonly root: Element;
    readonly lowerText: string;
    readonly isQuestVideo: boolean;
    readonly isMobilePopup: boolean;
    readonly isVencordOwned: boolean;
}

function isPluginOwnedControl(el: Element): boolean {
    // Only the element itself is ours. An ancestor check used to skip Discord's
    // real close button whenever the popup was mounted inside a quest tile
    // containing a Questcord-injected button.
    return (
        el.hasAttribute?.("data-questcord-btn") === true ||
        el.hasAttribute?.("data-questcord-queue-btn") === true
    );
}

function findQuestPopupRoot(el: Element): QuestPopupInfo | null {
    let current: Element | null = el;
    while (current && current.nodeName !== "BODY" && current.nodeName !== "HTML") {
        const root = current.closest?.(POPUP_ROOT_SELECTOR) as Element | null;
        if (!root || root.nodeName === "BODY" || root.nodeName === "HTML") return null;
        const isVencordOwned = isVencordOwnedLayer(root);

        const text = (root as HTMLElement).textContent ?? "";
        const lowerText = text.toLowerCase();
        const video = root.querySelector("video");
        const src = video ? video.src || video.currentSrc || "" : "";
        const isQuestVideo =
            video !== null &&
            (src.includes("cdn.discordapp.com/quests") ||
                src.includes("media.discordapp.net/quests") ||
                root.querySelector("[class*='questContent'], [class*='quest']") !== null);
        const isMobilePopup = MOBILE_POPUP_KEYWORDS.some((keyword) => lowerText.includes(keyword));
        const isVideoTextPopup = VIDEO_POPUP_KEYWORDS.some((keyword) =>
            lowerText.includes(keyword)
        );

        if (isQuestVideo || isMobilePopup || isVideoTextPopup || isVencordOwned) {
            return {
                root,
                lowerText,
                isQuestVideo,
                isMobilePopup: isMobilePopup || isVideoTextPopup,
                isVencordOwned,
            };
        }
        current = root.parentElement;
    }
    return null;
}

function looksLikeEnrollmentPopup(lowerText: string): boolean {
    return (
        lowerText.includes("accept quest") ||
        lowerText.includes("enroll") ||
        lowerText.includes("start quest") ||
        lowerText.includes("quest enrollment")
    );
}

/** Returns true when a popup was dismissed. `doc` is injectable for tests. */
export function tryDismissQuestVideo(
    doc: Document = document,
    sources: readonly DismissSource[] | null = null
): boolean {
    try {
        if (!settings.store.autoDismissQuestPopups) {
            debugLog(`${LOG_PREFIX} Auto-dismiss disabled by setting`);
            return false;
        }

        const dismissSources = sources ?? collectDismissSources(doc);
        const shadowRoots = dismissSources.filter((source) => source.kind === "shadow").length;
        const iframes = dismissSources.filter((source) => source.kind === "iframe").length;

        // Only Discord's stable ad/video close test id is decisive. A generic
        // close-button/class/text fallback matched Vencord's settings modal and
        // closed it (and could hit "Cancel" there), so it was removed entirely.
        const knownVideoCloses = queryDismissControls(dismissSources, VIDEO_CLOSE_TESTID_SELECTOR);
        let skippedVencordUi = 0;
        let guardedEnrollment = 0;
        let missingPopup = 0;

        for (const control of knownVideoCloses) {
            if (isPluginOwnedControl(control)) continue;
            const popup = findQuestPopupRoot(control);
            if (!popup) missingPopup += 1;
            if (popup?.isVencordOwned) {
                skippedVencordUi += 1;
                continue;
            }
            if (
                popup &&
                looksLikeEnrollmentPopup(popup.lowerText) &&
                Date.now() >= enrollmentDismissGraceUntil
            ) {
                guardedEnrollment += 1;
                debugLog(`${LOG_PREFIX} Skipping enrollment popup`);
                continue;
            }
            debugLog(`${LOG_PREFIX} Auto-dismissing quest popup via close control`);
            (control as HTMLElement).click();
            return true;
        }

        // The safety poll runs every second. Only repeat identical diagnostics
        // occasionally so debug mode stays usable during a long quest.
        const signature = JSON.stringify([
            knownVideoCloses.length,
            skippedVencordUi,
            guardedEnrollment,
            missingPopup,
            dismissSources.length,
            shadowRoots,
            iframes,
        ]);
        const now = Date.now();
        if (signature !== lastDismissLogSignature || now - lastDismissLogAt >= 30_000) {
            lastDismissLogSignature = signature;
            lastDismissLogAt = now;
            debugLog(
                `${LOG_PREFIX} No popup dismissed`,
                `controls=${knownVideoCloses.length}`,
                `videoCloseControls=${knownVideoCloses.length}`,
                `layers=0`,
                `vencordUiSkipped=${skippedVencordUi}`,
                `enrollmentGuarded=${guardedEnrollment}`,
                `missingPopup=${missingPopup}`,
                `sources=${dismissSources.length}`,
                `shadowRoots=${shadowRoots}`,
                `iframes=${iframes}`
            );
        }
        return false;
    } catch (e) {
        debugLog(`${LOG_PREFIX} Video dismiss error:`, e);
        return false;
    }
}
