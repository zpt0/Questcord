const KEY_SEPARATOR = ":";
export let activeQuests = new Map();
export let progressBars = new Map();
export let cleanupFunctions = new Map();
export let progressUpdateHandlers = new Map();
export let isPluginStopping = false;
export let refreshQuestButtonsRef = null;
export function setPluginStopping(value) {
    isPluginStopping = value;
}
export function setRefreshQuestButtonsRef(fn) {
    refreshQuestButtonsRef = fn;
}
export function getProgressBarKey(questId, userId) {
    return `${questId}${KEY_SEPARATOR}${userId}`;
}
export function parseProgressBarKey(key) {
    const parts = key.split(KEY_SEPARATOR);
    if (parts.length !== 2) return null;
    return { questId: parts[0], userId: parts[1] };
}
let _settingsStore = null;
export function initDebug(settingsStore) {
    _settingsStore = settingsStore;
}
export function debugLog(...args) {
    if (_settingsStore?.debugMode) console.log(...args);
}
