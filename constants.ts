/*!
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

export const PLUGIN_VERSION = "1.4.2";
export const LOG_PREFIX = "[Questcord]";
export const GITHUB_REPO = "zpt0/Questcord";
export const UPDATE_CHECK_URL = GITHUB_REPO
    ? `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
    : "";
export const GITHUB_RELEASE_URL = GITHUB_REPO
    ? `https://github.com/${GITHUB_REPO}/releases/latest`
    : "";
export const UPDATE_CHECK_ENABLED = !!GITHUB_REPO;
export const UPDATES_CHANNEL_ID = "1532348047697121340";
export const SUPPORT_INVITE_CODE = "9ra6MwHTHy";

// persisted DataStore keys; renaming orphans saved quests and queue for every user
export const SAVED_QUESTS_KEY = "questcord-active-quests";
export const QUEUE_KEY = "questcord-queue";
export const QUEUE_ENABLED_KEY = "questcord-queue-enabled";
