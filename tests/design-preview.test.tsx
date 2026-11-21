import { describe, expect, it } from "vitest";

import { DesignPreview } from "../components/DesignPreview";
import { LivePreviewSurface } from "../platform/settings";
import type { StubElement } from "./helpers/jsx-runtime";

function isStubElement(value: unknown): value is StubElement {
    return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

function collect(element: StubElement): StubElement[] {
    return [
        element,
        ...element.children.flatMap((child) => (isStubElement(child) ? collect(child) : [])),
    ];
}

describe("Questcord design preview", () => {
    it("uses the live pill classes and default geometry for every bubble", () => {
        const preview = DesignPreview() as unknown as StubElement;
        expect(preview.type).toBe(LivePreviewSurface);

        const elements = collect(preview);
        const classNames = elements
            .map((element) => element.props.className)
            .filter((value): value is string => typeof value === "string");

        expect(classNames).toContain("vc-pill-container qc-pos-top-center");
        expect(classNames).toContain("quest-pill always-expanded");
        expect(classNames).toContain("quest-pill-timer");
        expect(classNames).toContain("quest-pill-progress-bar");
        expect(classNames).toContain("quest-pill-progress-fill");
        expect(classNames).toContain("quest-pill-actions");
        expect(classNames).toContain("quest-sub-pill success");
        expect(classNames).toContain("quest-sub-pill info");
        expect(classNames).toContain("quest-sub-pill error");
        expect(classNames).toContain("quest-sub-pill cancel");
        expect(classNames.filter((name) => name === "quest-toast-close")).toHaveLength(4);

        const container = elements.find(
            (element) => element.props.className === "vc-pill-container qc-pos-top-center"
        );
        expect(container).toBeDefined();
        expect(container!.props["data-style"]).toBe("glass");

        const style = container!.props.style as Record<string, string | number>;
        expect(style["--qc-max-width"]).toBe("400px");
        expect(style["--qc-radius"]).toBe("10px");
        expect(style["--qc-font-size"]).toBe("13px");
        expect(style["--qc-padding"]).toBe("10px");
        expect(style["--qc-bg"]).toBe("rgba(0,0,0,0.85)");
        expect(style["--qc-accent"]).toBe("#5865F2");
        expect(style["--qc-border"]).toBe("rgba(255,255,255,0.08)");
    });
});
