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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { SettingsStore } from "@api/Settings";

import {
    createBridgeHost,
    createFoundationRuntime,
    type BridgeHost,
    type FoundationRuntime,
    type ResourceScope,
} from "./foundation";
import { PLUGIN_VERSION } from "./constants";
import { setOwnerScope } from "./core/ownership";
import { definition, settings } from "./settings";
import { createScopedLogger } from "./foundation/core/logging";

const log = createScopedLogger("pluginRuntime");

/** Declarative, read-only bridge surface: no quest control or account capability. */
const BRIDGE_CAPABILITIES = Object.freeze([
    "lifecycle.status",
    "settings.describe",
    "diagnostics.summary",
] as const);

type QuestcordRuntime = FoundationRuntime<typeof definition.definition>;
type StartHook = (scope: ResourceScope) => void | Promise<void>;
type StopHook = () => void | Promise<void>;

let activeRuntime: QuestcordRuntime | null = null;
let activeBridgeHost: BridgeHost | null = null;
let startPromise: Promise<void> | null = null;
let stopPromise: Promise<void> | null = null;

export function getActiveRuntime(): QuestcordRuntime | null {
    return activeRuntime;
}

export function getBridgeHost(): BridgeHost | null {
    return activeBridgeHost;
}

async function createAndStartRuntime(onStart?: StartHook): Promise<void> {
    if (activeRuntime) return;

    const bridgeHost = createBridgeHost({ ownerName: "Questcord" });
    const runtime = createFoundationRuntime({
        pluginName: "Questcord",
        definition,
        store: SettingsStore,
        version: PLUGIN_VERSION,
        bridge: {
            host: bridgeHost,
            capabilities: [...BRIDGE_CAPABILITIES],
        },
    });

    activeRuntime = runtime;
    activeBridgeHost = bridgeHost;

    const result = await runtime.start(async (scope) => {
        setOwnerScope(scope);
        void settings;

        await onStart?.(scope);

        runtime.recordDiagnostic("info", "Questcord runtime started", {
            plugin: "Questcord",
            version: PLUGIN_VERSION,
        });
    });

    if (!result.ok) {
        setOwnerScope(null);
        activeRuntime = null;
        activeBridgeHost = null;
        log.warn("Foundation runtime failed to start:", result.error);
    }
}

/** Creates a fresh runtime on every start; the foundation lifecycle cannot restart. */
export async function startRuntime(onStart?: StartHook): Promise<void> {
    if (stopPromise) await stopPromise;
    if (activeRuntime) return;
    if (startPromise) return startPromise;

    startPromise = createAndStartRuntime(onStart).finally(() => {
        startPromise = null;
    });
    return startPromise;
}

async function disposeRuntime(onStop?: StopHook): Promise<void> {
    const pendingStart = startPromise;
    if (pendingStart) await pendingStart;
    const runtime = activeRuntime;

    try {
        await onStop?.();
    } catch (error) {
        log.warn("Domain cleanup failed:", error);
    }

    // Stop new resources from being attached while disposal is running.
    setOwnerScope(null);

    if (runtime) {
        const report = await runtime.stop();
        if (!report.ok) {
            log.warn("Foundation runtime stopped with disposal errors:", report.errors);
        }
    }

    activeRuntime = null;
    activeBridgeHost = null;
}

export function stopRuntime(onStop?: StopHook): Promise<void> {
    if (stopPromise) return stopPromise;

    stopPromise = disposeRuntime(onStop).finally(() => {
        stopPromise = null;
    });
    return stopPromise;
}
