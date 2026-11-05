import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@webpack", () => ({
    findByPropsLazy: () => ({ getToken: () => "a".repeat(60) }),
    findStoreLazy: () => null,
}));

import { rateLimitedPost, initializeTraffic } from "../api";

describe("rateLimitedPost (uses Traffic queue)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("queues request when engine is running", async () => {
        const mockAPI = { post: vi.fn().mockResolvedValue({}) };
        const traffic = initializeTraffic(mockAPI);
        (traffic as any).isRunning = () => true;
        const promise = rateLimitedPost("/quests/q1/enroll", { location: 2 });
        await vi.advanceTimersByTimeAsync(5000);
        await expect(promise).resolves.toEqual({});
        expect(mockAPI.post).toHaveBeenCalledTimes(1);
    });

    it("traffic queue rejects when engine stopped", async () => {
        const mockAPI = { post: vi.fn().mockResolvedValue({}) };
        const traffic = initializeTraffic(mockAPI);
        (traffic as any).isRunning = () => false;
        await expect(rateLimitedPost("/quests/q1/enroll", { location: 2 })).rejects.toThrow(
            "Stopped"
        );
    });
});
