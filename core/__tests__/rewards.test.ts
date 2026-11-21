import { describe, expect, it } from "vitest";
import { questHasOrbReward, questOrbReward } from "../rewards";

describe("questOrbReward", () => {
    it("reads Orbs from rewardsConfig", () => {
        expect(
            questOrbReward({ rewardsConfig: { rewards: [{ type: "ORB", orbQuantity: 15 }] } })
        ).toEqual({ base: 15 });
    });

    it("returns null when no Orb reward exists", () => {
        expect(questOrbReward({ rewards: [{ type: "NITRO", quantity: 5 }] })).toBeNull();
    });
});

describe("questHasOrbReward", () => {
    it("detects Orbs in the legacy quest config", () => {
        expect(
            questHasOrbReward({
                config: { rewardsConfig: { rewards: [{ rewardType: "ORB", orbQuantity: 7 }] } },
            })
        ).toBe(true);
    });

    it("detects Orbs in a nested task config", () => {
        expect(
            questHasOrbReward({
                config: { taskConfig: { rewards: [{ type: "ORB", orbQuantity: 3 }] } },
            })
        ).toBe(true);
    });

    it("is false for non-Orb and missing rewards", () => {
        expect(questHasOrbReward({ config: { rewards: [{ type: "NITRO" }] } })).toBe(false);
        expect(questHasOrbReward(undefined)).toBe(false);
    });
});
