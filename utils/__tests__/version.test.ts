import { describe, it, expect } from "vitest";
import { compareVersions } from "../../core/utils";

describe("compareVersions", () => {
    it("returns 0 for equal versions", () => {
        expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
        expect(compareVersions("2.2.0", "2.2.0")).toBe(0);
    });

    it("returns 1 when v1 is newer", () => {
        expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
        expect(compareVersions("1.1.0", "1.0.9")).toBe(1);
        expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
    });

    it("returns -1 when v1 is older", () => {
        expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
        expect(compareVersions("1.0.9", "1.1.0")).toBe(-1);
    });

    it("handles leading 'v' prefixes and extra text", () => {
        expect(compareVersions("v2.0.0", "1.9.9")).toBe(1);
        expect(compareVersions("release-1.2.3", "1.2.3")).toBe(0);
    });

    it("treats missing segments as zero", () => {
        expect(compareVersions("2", "2.0.0")).toBe(0);
        expect(compareVersions("2.1", "2.1.0")).toBe(0);
    });
});
