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

import { LOG_PREFIX } from "../constants";
import { discordApiPost } from "../core/api";
import { debugLog } from "../core/state";
import { settings } from "../settings";

const RELAY_URL = "http://127.0.0.1:43210";

interface AchievementProgressPayload {
    application_id: string;
    proxy_ticket: string;
    progress: number;
}

async function fetchProxyTicket(applicationId: string, code: string): Promise<string | null> {
    try {
        const res = await discordApiPost(`/applications/${applicationId}/proxy-tickets`, {
            code,
        });
        return res?.ticket ?? null;
    } catch (e: any) {
        debugLog(`${LOG_PREFIX} Failed to fetch proxy ticket:`, e?.message ?? e);
        return null;
    }
}

async function postAchievementProgress(
    applicationId: string,
    proxyTicket: string,
    progress: number
): Promise<boolean> {
    const payload: AchievementProgressPayload = {
        application_id: applicationId,
        proxy_ticket: proxyTicket,
        progress,
    };

    const token = (window as any).localStorage?.getItem("token") ?? "";
    const baseHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: token,
    };

    const endpoints = [
        { url: `${RELAY_URL}/proxy`, headers: { ...baseHeaders, "X-Orion-Relay": "1" } },
        {
            url: `https://${applicationId}.discordsays.com/api/v1/achievements/progress`,
            headers: baseHeaders,
        },
    ];

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint.url, {
                method: "POST",
                headers: endpoint.headers,
                body: JSON.stringify(payload),
            });
            if (response.ok) {
                debugLog(`${LOG_PREFIX} Achievement progress posted via ${endpoint.url}`);
                return true;
            }
            debugLog(
                `${LOG_PREFIX} Achievement progress failed (${response.status}) via ${endpoint.url}`
            );
        } catch (e: any) {
            debugLog(
                `${LOG_PREFIX} Achievement progress error via ${endpoint.url}:`,
                e?.message ?? e
            );
        }
    }
    return false;
}

async function revokeOAuthGrant(applicationId: string): Promise<void> {
    try {
        await discordApiPost(`/users/@me/applications/${applicationId}/authorize`, {
            revoke: true,
        });
        debugLog(`${LOG_PREFIX} Revoked OAuth grant for ${applicationId}`);
    } catch (e: any) {
        debugLog(`${LOG_PREFIX} Failed to revoke OAuth grant:`, e?.message ?? e);
    }
}

export async function bypassAchievementInActivity(quest: any): Promise<boolean> {
    if (!settings.store.enableAchievementBypass) {
        return false;
    }

    const taskConfig =
        quest.config?.taskConfig ??
        quest.config?.taskConfigV2 ??
        quest.taskConfig ??
        quest.taskConfigV2;
    const achievementTask = taskConfig?.tasks?.ACHIEVEMENT_IN_ACTIVITY;
    if (!achievementTask) {
        return false;
    }

    const applicationId = achievementTask.applications?.[0]?.id;
    const targetProgress = achievementTask.target;
    if (!applicationId || !targetProgress) {
        return false;
    }

    const applicationName = achievementTask.applications?.[0]?.name ?? "Activity";

    try {
        const oauthUrl = `https://discord.com/oauth2/authorize?client_id=${applicationId}&response_type=code&scope=identify%20applications.commands%20applications.entitlements&prompt=consent`;

        debugLog(`${LOG_PREFIX} Opening OAuth for ${applicationName} (${applicationId})`);

        const popup = window.open(oauthUrl, "oauth", "width=500,height=600");
        if (!popup) {
            debugLog(`${LOG_PREFIX} OAuth popup blocked`);
            return false;
        }

        const code = await new Promise<string | null>((resolve) => {
            const checkClosed = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkClosed);
                    resolve(null);
                }
                try {
                    if (popup.location.href.includes("code=")) {
                        const url = new URL(popup.location.href);
                        const code = url.searchParams.get("code");
                        clearInterval(checkClosed);
                        popup.close();
                        resolve(code);
                    }
                } catch {}
            }, 500);
        });

        if (!code) {
            debugLog(`${LOG_PREFIX} OAuth cancelled or failed`);
            return false;
        }

        debugLog(`${LOG_PREFIX} Got OAuth code, fetching proxy ticket...`);
        const proxyTicket = await fetchProxyTicket(applicationId, code);
        if (!proxyTicket) {
            debugLog(`${LOG_PREFIX} Failed to get proxy ticket`);
            await revokeOAuthGrant(applicationId);
            return false;
        }

        debugLog(`${LOG_PREFIX} Posting achievement progress...`);
        const success = await postAchievementProgress(applicationId, proxyTicket, targetProgress);

        await revokeOAuthGrant(applicationId);

        return success;
    } catch (e: any) {
        debugLog(`${LOG_PREFIX} Achievement bypass error:`, e?.message ?? e);
        return false;
    }
}

export function isAchievementBypassEnabled(): boolean {
    return settings.store.enableAchievementBypass ?? false;
}
