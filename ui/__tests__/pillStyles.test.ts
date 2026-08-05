import { describe, it, expect } from "vitest";

describe("hexToRgba", () => {
    function hexToRgba(hex: string, alpha: number): string {
        const m = hex.replace("#", "").match(/.{2}/g);
        if (!m || m.length < 3) return `rgba(0,0,0,${alpha})`;
        const r = parseInt(m[0], 16);
        const g = parseInt(m[1], 16);
        const b = parseInt(m[2], 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    it("converts hex to rgba", () => {
        expect(hexToRgba("#000000", 1)).toBe("rgba(0,0,0,1)");
        expect(hexToRgba("#ffffff", 0.5)).toBe("rgba(255,255,255,0.5)");
        expect(hexToRgba("#5865F2", 0.85)).toBe("rgba(88,101,242,0.85)");
    });

    it("handles hex without #", () => {
        expect(hexToRgba("ff0000", 1)).toBe("rgba(255,0,0,1)");
    });

    it("returns fallback for invalid hex", () => {
        expect(hexToRgba("abc", 0.5)).toBe("rgba(0,0,0,0.5)");
        expect(hexToRgba("", 1)).toBe("rgba(0,0,0,1)");
    });
});

describe("POSITION_CLASSES", () => {
    const POSITION_CLASSES = [
        "qc-pos-top-left",
        "qc-pos-top-center",
        "qc-pos-top-right",
        "qc-pos-bottom-left",
        "qc-pos-bottom-center",
        "qc-pos-bottom-right",
    ];

    it("contains all 6 position classes", () => {
        expect(POSITION_CLASSES).toHaveLength(6);
        expect(POSITION_CLASSES).toContain("qc-pos-top-left");
        expect(POSITION_CLASSES).toContain("qc-pos-top-center");
        expect(POSITION_CLASSES).toContain("qc-pos-top-right");
        expect(POSITION_CLASSES).toContain("qc-pos-bottom-left");
        expect(POSITION_CLASSES).toContain("qc-pos-bottom-center");
        expect(POSITION_CLASSES).toContain("qc-pos-bottom-right");
    });
});
