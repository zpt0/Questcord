import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@webpack", () => ({
    findByPropsLazy: () => ({ getToken: () => "a".repeat(60) }),
}));

import { discordApiGet, rateLimitedPost, initializeTraffic } from "../api";
import { Traffic } from "../traffic";

function stubResponse(data: any, status = 200, retryAfter?: string) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
            get: (name: string) =>
                name.toLowerCase() === "retry-after" ? (retryAfter ?? null) : null,
        },
        json: async () => data,
        text: async () => JSON.stringify(data),
    };
}

function fetchMock() {
    return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

describe("discordApiGet", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("fetch", vi.fn());
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("returns data on 200", async () => {
        fetchMock().mockResolvedValueOnce(stubResponse({ body: { id: "q1" } }, 200));
        const result = await discordApiGet("/quests/q1");
        expect(result).toEqual({ body: { id: "q1" } });
        expect(fetchMock()).toHaveBeenCalledTimes(1);
    });

    it("throws on 403 without retry", async () => {
        fetchMock().mockResolvedValueOnce(stubResponse({}, 403));
        await expect(discordApiGet("/quests/q1")).rejects.toMatchObject({
            status: 403,
        });
        expect(fetchMock()).toHaveBeenCalledTimes(1);
    });

    it("throws on 429 without retry (retry logic moved to Traffic)", async () => {
        fetchMock().mockResolvedValueOnce(stubResponse({ error: "slow down" }, 429, "1"));
        await expect(discordApiGet("/quests/q1")).rejects.toMatchObject({
            status: 429,
        });
        expect(fetchMock()).toHaveBeenCalledTimes(1);
    });

    it("throws on network error", async () => {
        fetchMock().mockRejectedValueOnce(new Error("fetch failed"));
        await expect(discordApiGet("/quests/q1")).rejects.toThrow("fetch failed");
        expect(fetchMock()).toHaveBeenCalledTimes(1);
    });

    it("throws on 500", async () => {
        fetchMock().mockResolvedValueOnce(stubResponse({}, 500));
        await expect(discordApiGet("/quests/q1")).rejects.toMatchObject({ status: 500 });
        expect(fetchMock()).toHaveBeenCalledTimes(1);
    });
});

describe("rateLimitedPost (uses Traffic queue)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("fetch", vi.fn());
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
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
        await expect(rateLimitedPost("/quests/q1/enroll", { location: 2 })).rejects.toThrow("Stopped");
    });
});
