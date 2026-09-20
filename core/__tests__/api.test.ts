import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@webpack", () => ({
    findByPropsLazy: () => ({ getToken: () => "a".repeat(60) }),
}));

import { discordApiGet, rateLimitedPost } from "../api";

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

describe("discordApiGet retry", () => {
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

    it("retries 429 with Retry-After header then succeeds", async () => {
        fetchMock()
            .mockResolvedValueOnce(stubResponse({ error: "slow down" }, 429, "1"))
            .mockResolvedValueOnce(stubResponse({ body: { id: "q1" } }, 200));
        const promise = discordApiGet("/quests/q1", 3);
        await vi.advanceTimersByTimeAsync(5000);
        await expect(promise).resolves.toEqual({ body: { id: "q1" } });
        expect(fetchMock()).toHaveBeenCalledTimes(2);
    });

    it("does not retry 403 errors", async () => {
        fetchMock().mockResolvedValueOnce(stubResponse({}, 403));
        await expect(discordApiGet("/quests/q1", 3)).rejects.toMatchObject({
            status: 403,
        });
        expect(fetchMock()).toHaveBeenCalledTimes(1);
    });

    it("retries network errors then succeeds", async () => {
        fetchMock()
            .mockRejectedValueOnce(new Error("fetch failed"))
            .mockResolvedValueOnce(stubResponse({ ok: true }, 200));
        const promise = discordApiGet("/quests/q1", 3);
        await vi.advanceTimersByTimeAsync(30000);
        await expect(promise).resolves.toEqual({ ok: true });
        expect(fetchMock()).toHaveBeenCalledTimes(2);
    });

    it("throws after exhausting retries on 500", async () => {
        fetchMock().mockResolvedValue(stubResponse({}, 500));
        const promise = discordApiGet("/quests/q1", 2);
        const assertion = expect(promise).rejects.toMatchObject({ status: 500 });
        await vi.advanceTimersByTimeAsync(30000);
        await assertion;
        expect(fetchMock()).toHaveBeenCalledTimes(2);
    });
});

describe("rateLimitedPost retry", () => {
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

    it("retries 429 then succeeds", async () => {
        fetchMock()
            .mockResolvedValueOnce(stubResponse({ error: "slow" }, 429, "1"))
            .mockResolvedValueOnce(stubResponse({}, 200));
        const promise = rateLimitedPost("/quests/q1/enroll", { location: 2 }, 3);
        await vi.advanceTimersByTimeAsync(5000);
        await expect(promise).resolves.toEqual({});
        expect(fetchMock()).toHaveBeenCalledTimes(2);
    });

    it("throws immediately on 401 without retry", async () => {
        fetchMock().mockResolvedValueOnce(stubResponse({}, 401));
        await expect(rateLimitedPost("/quests/q1/enroll", {}, 3)).rejects.toMatchObject({
            status: 401,
        });
        expect(fetchMock()).toHaveBeenCalledTimes(1);
    });
});
