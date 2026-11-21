import { describe, expect, it } from "vitest";

import {
    clearEnrollmentRequested,
    isEnrollmentRequested,
    markEnrollmentRequested,
    resetEnrollmentMemory,
} from "../enrollmentMemory";

describe("enrollmentMemory", () => {
    it("marks a successful enrollment request", () => {
        resetEnrollmentMemory();
        markEnrollmentRequested("quest-1");
        expect(isEnrollmentRequested("quest-1")).toBe(true);
        expect(isEnrollmentRequested("quest-2")).toBe(false);
    });

    it("expires and can be cleared explicitly", () => {
        resetEnrollmentMemory();
        markEnrollmentRequested("quest-1", -1);
        expect(isEnrollmentRequested("quest-1")).toBe(false);

        markEnrollmentRequested("quest-2");
        clearEnrollmentRequested("quest-2");
        expect(isEnrollmentRequested("quest-2")).toBe(false);
    });
});
