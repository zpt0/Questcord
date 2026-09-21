export const PLUGIN_VERSION = "1.1.4";
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
