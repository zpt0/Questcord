import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    createManagedAbortController,
    createManagedInterval,
    createManagedMutationObserver,
    getOwnerScope,
    releaseManagedAbortController,
    scheduleManagedTimeout,
} from "../core/ownership";
import { getActiveRuntime, getBridgeHost, startRuntime, stopRuntime } from "../pluginRuntime";
import { __settingsStore, setPluginSettings } from "./helpers/vencord-mocks";

describe("Questcord foundation lifecycle", () => {
    beforeEach(() => {
        (globalThis as any).window = {};
        __settingsStore.reset();
        setPluginSettings("Questcord", {
            foundationBridgeEnabled: true,
            foundationDiagnosticsEnabled: false,
            foundationLogLevel: "warn",
        });
    });

    afterEach(async () => {
        await stopRuntime();
    });

    it("owns the bridge and disposes managed resources on stop", async () => {
        let disconnectCalls = 0;
        class MockMutationObserver {
            constructor(_callback: MutationCallback) {}
            observe() {}
            disconnect() {
                disconnectCalls += 1;
            }
            takeRecords() {
                return [];
            }
        }
        (globalThis as any).MutationObserver = MockMutationObserver;

        await startRuntime();

        const runtime = getActiveRuntime();
        const host = getBridgeHost();
        expect(runtime?.status.lifecycle).toBe("started");
        expect(runtime?.status.bridge).toBe("registered");
        expect(getOwnerScope()?.isDisposed).toBe(false);
        expect(host?.listRegistrations()).toHaveLength(1);
        expect(host?.listRegistrations()[0].capabilities).toEqual([
            "lifecycle.status",
            "settings.describe",
            "diagnostics.summary",
        ]);

        const response = await host!.handleRequest({
            version: 1,
            capability: "settings.describe",
            action: "schema",
        });
        expect(response.ok).toBe(true);
        expect(JSON.stringify(response)).not.toMatch(/gettoken|authorization/i);

        const timeout = vi.fn();
        const interval = vi.fn();
        scheduleManagedTimeout(timeout, 60_000, "test", "test:timeout");
        createManagedInterval(interval, 60_000, "test", "test:interval");
        const observer = createManagedMutationObserver(() => {}, "test");
        const ownedController = createManagedAbortController("test-owned");
        const releasedController = createManagedAbortController("test-released");
        releaseManagedAbortController(releasedController);

        expect(getOwnerScope()?.has("test:timeout")).toBe(true);
        expect(getOwnerScope()?.has("test:interval")).toBe(true);
        expect(observer).toBeInstanceOf(MockMutationObserver);
        expect(ownedController.signal.aborted).toBe(false);
        expect(releasedController.signal.aborted).toBe(false);

        await stopRuntime();

        expect(timeout).not.toHaveBeenCalled();
        expect(interval).not.toHaveBeenCalled();
        expect(disconnectCalls).toBe(1);
        expect(ownedController.signal.aborted).toBe(true);
        expect(releasedController.signal.aborted).toBe(false);
        expect(getActiveRuntime()).toBeNull();
        expect(getOwnerScope()).toBeNull();
        expect(getBridgeHost()).toBeNull();
        expect(host?.listRegistrations()).toHaveLength(0);
    });

    it("creates a fresh runtime on every start after stop", async () => {
        await startRuntime();
        const first = getActiveRuntime();
        await stopRuntime();

        await startRuntime();
        const second = getActiveRuntime();
        expect(second).not.toBeNull();
        expect(second).not.toBe(first);
        expect(second?.status.lifecycle).toBe("started");
    });

    it("does not expose quest control or account capabilities on the bridge", async () => {
        await startRuntime();
        const host = getBridgeHost();
        const capabilities = host!.listRegistrations()[0].capabilities;

        expect(capabilities).not.toContain("quest.control");
        expect(capabilities).not.toContain("account.switch");
        expect(capabilities).not.toContain("achievement.bypass");
        expect(capabilities).not.toContain("datastore.write");

        const unsupported = await host!.handleRequest({
            version: 1,
            capability: "quest.control",
            action: "start",
        });
        expect(unsupported.ok).toBe(false);
    });
});
