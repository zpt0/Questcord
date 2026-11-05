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
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { findByPropsLazy } from "@webpack";
import { getWebpackModules } from "./stores";

export interface OrbReward {
    base: number;
    premium?: number;
}

const VirtualCurrencyStore = findByPropsLazy("getBalance", "fetchBalance");

export function canUseMoreQuestOrbs(): boolean {
    try {
        const modules = getWebpackModules();
        const fn = modules.find((x: any) => x?.exports?.canUseMoreQuestOrbs)?.exports
            ?.canUseMoreQuestOrbs;
        if (typeof fn === "function") return fn();
    } catch {}
    return false;
}

export function questOrbReward(config: any): OrbReward | null {
    try {
        const rewards = config?.rewardsConfig?.rewards ?? config?.rewards ?? [];
        let totalBase = 0;
        let totalPremium = 0;
        for (const reward of rewards) {
            if (
                reward?.type === "ORB" ||
                reward?.rewardType === "ORB" ||
                reward?.orbQuantity != null
            ) {
                const base = reward.orbQuantity ?? reward.quantity ?? 0;
                const premium = reward.premiumOrbQuantity ?? reward.premiumQuantity ?? base;
                totalBase += base;
                totalPremium += premium;
            }
        }
        if (totalBase > 0) {
            return {
                base: totalBase,
                premium: totalPremium > totalBase ? totalPremium : undefined,
            };
        }
    } catch {}
    return null;
}

export function totalOrbReward(rewards: Array<OrbReward | null>): OrbReward | null {
    let totalBase = 0;
    let totalPremium = 0;
    let hasAny = false;
    for (const r of rewards) {
        if (r) {
            hasAny = true;
            totalBase += r.base;
            totalPremium += r.premium ?? r.base;
        }
    }
    return hasAny
        ? { base: totalBase, premium: totalPremium > totalBase ? totalPremium : undefined }
        : null;
}

export function formatOrbReward(reward: OrbReward | null, showPremium = false): string | null {
    if (!reward) return null;
    if (showPremium && reward.premium && reward.premium > reward.base) {
        return `${reward.base} Orbs (${reward.premium} with Nitro)`;
    }
    return `${reward.base} Orbs`;
}

export async function readOrbBalance(): Promise<number | null> {
    try {
        const balance = VirtualCurrencyStore?.getBalance?.();
        if (typeof balance === "number") return balance;
    } catch {}
    try {
        await VirtualCurrencyStore?.fetchBalance?.();
        const balance = VirtualCurrencyStore?.getBalance?.();
        if (typeof balance === "number") return balance;
    } catch {}
    return null;
}

export function formatOrbBalance(balance: number | null): string | null {
    if (balance == null) return null;
    return balance.toLocaleString();
}
