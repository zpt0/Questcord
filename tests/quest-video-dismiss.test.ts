import { beforeEach, describe, expect, it, vi } from "vitest";

import { settings } from "../settings";
import {
    noteQuestEnrollment,
    resetQuestEnrollmentGuard,
    tryDismissQuestVideo,
} from "../ui/questVideoDismiss";

interface FakeControlOptions {
    readonly attrs?: Record<string, string>;
    readonly own?: boolean;
    readonly nestedOwn?: boolean;
    readonly popupRoot?: unknown;
}

function fakeControl({
    attrs = {},
    own = false,
    nestedOwn = false,
    popupRoot = null,
}: FakeControlOptions): any {
    const allAttrs = own ? { ...attrs, "data-questcord-btn": "" } : attrs;
    return {
        nodeName: "BUTTON",
        textContent: "",
        className: allAttrs.class ?? "",
        getAttribute(name: string) {
            return allAttrs[name] ?? null;
        },
        hasAttribute(name: string) {
            return Object.prototype.hasOwnProperty.call(allAttrs, name);
        },
        closest(selector: string) {
            if (selector.includes("data-questcord")) return own || nestedOwn ? this : null;
            if (
                selector.includes("data-mana-component") ||
                selector.includes("role='dialog'") ||
                selector.includes("layerContainer") ||
                selector.includes("class*='modal'") ||
                selector.includes("backdrop") ||
                selector.includes("popout") ||
                selector.includes("popover")
            ) {
                return popupRoot;
            }
            return null;
        },
        click: vi.fn(),
    };
}

interface FakeLayerOptions {
    readonly text: string;
    readonly vencord?: boolean;
}

function fakeLayer({ text, vencord = false }: FakeLayerOptions): any {
    return {
        nodeName: "DIV",
        textContent: text,
        parentElement: null,
        matches(selector: string) {
            return vencord && selector.includes("vc-");
        },
        closest(selector: string) {
            return vencord && selector.includes("vc-") ? this : null;
        },
        querySelector() {
            return null;
        },
    };
}

interface FakeDocOptions {
    readonly controls?: readonly any[];
    readonly shadowHosts?: readonly any[];
}

function fakeDoc({ controls = [], shadowHosts = [] }: FakeDocOptions): Document {
    return {
        querySelectorAll(selector: string) {
            if (selector === "*") return [...shadowHosts];
            if (selector === "iframe") return [];
            if (
                selector.includes("ad-video-modal-close-btn") ||
                selector.includes("video-modal-close") ||
                selector.includes("quest-video-close")
            ) {
                return controls.filter((control) => {
                    const testId = control.getAttribute?.("data-testid") ?? "";
                    return (
                        testId === "ad-video-modal-close-btn" ||
                        testId.includes("video-modal-close") ||
                        testId.includes("quest-video-close")
                    );
                });
            }
            return [];
        },
    } as unknown as Document;
}

const VIDEO_CLOSE_ATTRS = {
    "data-mana-component": "button",
    role: "button",
    class: "button_F7qvhY md_F7qvhY overlay-secondary_F7qvhY",
    type: "button",
    "data-testid": "ad-video-modal-close-btn",
    "aria-label": "Close",
};

describe("Questcord quest popup auto-dismiss", () => {
    beforeEach(() => {
        settings.store.autoDismissQuestPopups = true;
        resetQuestEnrollmentGuard();
    });

    it("clicks Discord's ad-video-modal-close-btn directly", () => {
        const close = fakeControl({ attrs: VIDEO_CLOSE_ATTRS });

        expect(tryDismissQuestVideo(fakeDoc({ controls: [close] }))).toBe(true);
        expect(close.click).toHaveBeenCalledOnce();
    });

    it("finds Discord's close button inside an open shadow root", () => {
        const close = fakeControl({ attrs: VIDEO_CLOSE_ATTRS });
        const shadowRoot = {
            querySelectorAll(selector: string) {
                return selector.includes("ad-video-modal-close-btn") ? [close] : [];
            },
        };
        const doc = fakeDoc({ shadowHosts: [{ shadowRoot }] });

        expect(tryDismissQuestVideo(doc)).toBe(true);
        expect(close.click).toHaveBeenCalledOnce();
    });

    it("still clicks Discord's close button inside a Questcord-injected ancestor", () => {
        const close = fakeControl({ attrs: VIDEO_CLOSE_ATTRS, nestedOwn: true });

        expect(tryDismissQuestVideo(fakeDoc({ controls: [close] }))).toBe(true);
        expect(close.click).toHaveBeenCalledOnce();
    });

    it("never clicks a generic close button, so Vencord settings stay open", () => {
        const settingsClose = fakeControl({ attrs: { "aria-label": "Close" } });
        const layer = fakeLayer({ text: "Video settings" });
        settingsClose.closest = () => layer;

        expect(tryDismissQuestVideo(fakeDoc({ controls: [settingsClose] }))).toBe(false);
        expect(settingsClose.click).not.toHaveBeenCalled();
    });

    it("does not treat a 'video'/'QR' text layer as a quest popup", () => {
        const layer = fakeLayer({ text: "Video settings — QR code" });
        const settingsClose = fakeControl({ attrs: { "aria-label": "Close" } });
        settingsClose.closest = () => layer;

        expect(tryDismissQuestVideo(fakeDoc({ controls: [settingsClose] }))).toBe(false);
        expect(settingsClose.click).not.toHaveBeenCalled();
    });

    it("does not click a video close button inside a Vencord-owned layer", () => {
        const layer = fakeLayer({ text: "Quest video", vencord: true });
        const close = fakeControl({ attrs: VIDEO_CLOSE_ATTRS, popupRoot: layer });

        expect(tryDismissQuestVideo(fakeDoc({ controls: [close] }))).toBe(false);
        expect(close.click).not.toHaveBeenCalled();
    });

    it("does nothing when the setting is disabled", () => {
        settings.store.autoDismissQuestPopups = false;
        const close = fakeControl({ attrs: VIDEO_CLOSE_ATTRS });

        expect(tryDismissQuestVideo(fakeDoc({ controls: [close] }))).toBe(false);
        expect(close.click).not.toHaveBeenCalled();
    });

    it("never clicks Questcord's own injected buttons", () => {
        const own = fakeControl({ attrs: VIDEO_CLOSE_ATTRS, own: true });

        expect(tryDismissQuestVideo(fakeDoc({ controls: [own] }))).toBe(false);
        expect(own.click).not.toHaveBeenCalled();
    });

    it("keeps the enrollment guard before QUESTS_ENROLL_SUCCESS", () => {
        const layer = fakeLayer({ text: "Enroll and scan this QR code on your phone" });
        const close = fakeControl({ attrs: VIDEO_CLOSE_ATTRS, popupRoot: layer });

        expect(tryDismissQuestVideo(fakeDoc({ controls: [close] }))).toBe(false);
        expect(close.click).not.toHaveBeenCalled();
    });

    it("dismisses the post-enrollment popup after QUESTS_ENROLL_SUCCESS", () => {
        noteQuestEnrollment();
        const layer = fakeLayer({ text: "Enroll and scan this QR code on your phone" });
        const close = fakeControl({ attrs: VIDEO_CLOSE_ATTRS, popupRoot: layer });

        expect(tryDismissQuestVideo(fakeDoc({ controls: [close] }))).toBe(true);
        expect(close.click).toHaveBeenCalledOnce();
    });

    it("does nothing when the stable close button is not in the DOM", () => {
        const settingsClose = fakeControl({ attrs: { "aria-label": "Close" } });

        expect(tryDismissQuestVideo(fakeDoc({ controls: [settingsClose] }))).toBe(false);
        expect(settingsClose.click).not.toHaveBeenCalled();
    });
});
