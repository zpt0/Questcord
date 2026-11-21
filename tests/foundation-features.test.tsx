import { describe, expect, it } from "vitest";

import { config } from "../components/UnifiedSettings";
import {
    FoundationCard,
    FoundationLogViewer,
    FoundationPatchStatus,
    FoundationUpdatePanel,
} from "../foundation/ui/components";
import { patchManifest } from "../patches";
import type { StubElement } from "./helpers/jsx-runtime";

function elements(node: unknown, predicate: (element: StubElement) => boolean): StubElement[] {
    if (node === null || typeof node !== "object") return [];
    const element = node as StubElement;
    const found = predicate(element) ? [element] : [];
    for (const child of element.children ?? []) found.push(...elements(child, predicate));
    return found;
}

describe("Questcord shared foundation features", () => {
    it("wires the update, patch and log panels into the settings shell", () => {
        expect(config.updates).toHaveLength(1);
        const groups = config.categories.flatMap((category) => category.groups);
        const groupIds = groups.map((group) => group.id);

        expect(groupIds).toContain("questcord-release-feed");
        expect(groupIds).toContain("questcord-patch-status");
        expect(groupIds).toContain("questcord-log-viewer");
        expect(groups.find((group) => group.id === "questcord-log-viewer")?.render).toBe(
            FoundationLogViewer
        );
    });

    it("renders one status card per patch", () => {
        const rendered = FoundationPatchStatus({
            manifest: patchManifest,
            pluginName: config.pluginName,
            version: config.version,
        }) as unknown as StubElement;

        expect(elements(rendered, (element) => element.type === FoundationCard)).toHaveLength(
            patchManifest.entries.length
        );
        expect(
            elements(rendered, (element) => element.children.includes("Copy debug info")).length
        ).toBeGreaterThan(0);
    });

    it("links the shared update panel to release notes and the changelog", () => {
        const rendered = FoundationUpdatePanel({
            targets: config.updates!,
        }) as unknown as StubElement;
        const links = elements(rendered, (element) => element.type === "a").map((element) =>
            String(element.props.href)
        );

        expect(links).toContain("https://github.com/zpt0/Questcord/releases/latest");
        expect(links).toContain("https://github.com/zpt0/Questcord/blob/main/CHANGELOG.md");
    });
});
