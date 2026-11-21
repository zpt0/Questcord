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

import { UserStore } from "@webpack/common";
import { settings } from "../settings";
import {
    buildNotificationKey,
    shouldSuppressNotification,
    type NotificationSignature,
} from "../core/utils";
import { cancelQuest } from "../quests/manager";
import { cancelManagedInterval, createManagedInterval } from "../core/ownership";
import { applyPillContainerStyle } from "./pillStyles";
import { createScopedLogger } from "../foundation/core/logging";

const log = createScopedLogger("ui/notifications");

const questPills = new Map<string, HTMLElement>();
let pillContainer: HTMLElement | null = null;

const PILL_ICONS: Record<string, string> = {
    success:
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 8h.01"/><path d="M12 11v5"/></svg>',
    cancel: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

const questPillTimers = new Map<
    string,
    { startedAt: number; interval: ReturnType<typeof setInterval> }
>();

function escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function formatElapsed(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

function startPillTimer(questId: string, pill: HTMLElement): void {
    stopPillTimer(questId);
    const startedAt = Date.now();
    const interval = createManagedInterval(() => {
        if (!pill.isConnected || pill.classList.contains("completed")) {
            stopPillTimer(questId);
            return;
        }
        const timer = pill.querySelector(".quest-pill-timer");
        if (timer) timer.textContent = formatElapsed(Date.now() - startedAt);
    }, 1000);
    questPillTimers.set(questId, { startedAt, interval });
}

function stopPillTimer(questId: string): void {
    const timer = questPillTimers.get(questId);
    if (!timer) return;
    cancelManagedInterval(timer.interval);
    questPillTimers.delete(questId);
}

function getPillContainer(): HTMLElement {
    const existing = document.getElementById("vc-pill-container");
    if (existing) {
        pillContainer = existing;
        applyPillContainerStyle(existing);
        return existing;
    }
    if (!pillContainer || !document.body.contains(pillContainer)) {
        pillContainer = document.createElement("div");
        pillContainer.id = "vc-pill-container";
        pillContainer.className = "vc-pill-container";
        document.body.appendChild(pillContainer);
    }
    applyPillContainerStyle(pillContainer);
    return pillContainer;
}

function closePillElement(el: HTMLElement, delay = 900) {
    if (el.classList.contains("hiding")) return;
    el.classList.add("hiding");
    // delay must stay >= the questPillExit animation in styles.css
    setTimeout(() => el.remove(), delay);
}

export function createQuestPill(questId: string, title: string): void {
    if (!settings.store.showProgressBar) return;
    removeQuestPill(questId);

    const container = getPillContainer();
    const row = document.createElement("div");
    row.className = "quest-pill-row";
    row.id = `quest-row-${questId}`;

    const pill = document.createElement("div");
    pill.className = "quest-pill";
    pill.id = `quest-pill-${questId}`;

    const timerHtml =
        settings.store.pillShowTimer !== false ? '<span class="quest-pill-timer">0s</span>' : "";

    pill.innerHTML = `
        <div class="quest-pill-compact">
            <div class="quest-pill-spinner"></div>
            <span class="quest-pill-title">${escapeHtml(title)}</span>
            ${timerHtml}
            <span class="quest-pill-percent">0%</span>
        </div>
        <div class="quest-pill-expanded">
            <div class="quest-pill-expanded-inner">
                <div class="quest-pill-body">Initializing...</div>
                <div class="quest-pill-progress-bar">
                    <div class="quest-pill-progress-fill"></div>
                </div>
                <div class="quest-pill-actions">
                    <button class="quest-btn quest-cancel-btn">Cancel</button>
                </div>
            </div>
        </div>
    `;

    row.appendChild(pill);
    container.insertBefore(row, container.firstChild);
    questPills.set(questId, row);
    if (timerHtml) startPillTimer(questId, pill);

    const cancelBtn = pill.querySelector(".quest-cancel-btn");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            const userId = UserStore.getCurrentUser()?.id;
            if (userId) cancelQuest(questId, userId);
        });
    }
}

export function updateQuestPill(questId: string, body?: string, percent?: number): void {
    const row =
        questPills.get(questId) || (document.getElementById(`quest-row-${questId}`) as HTMLElement);
    if (!row) return;
    const pill = row.querySelector(".quest-pill");
    if (!pill || pill.classList.contains("completed")) return;

    if (body !== undefined) {
        const bodyEl = pill.querySelector(".quest-pill-body");
        if (bodyEl) bodyEl.textContent = body;
    }

    if (percent !== undefined) {
        const floored = Math.floor(percent);
        // cap below 100 so a filled bar only appears on real completion
        const safePercent = percent >= 100 ? 100 : Math.min(99, Math.max(0, floored));
        const percentEl = pill.querySelector(".quest-pill-percent");
        if (percentEl) percentEl.textContent = `${safePercent}%`;

        const progressFill = pill.querySelector(".quest-pill-progress-fill") as HTMLElement;
        if (progressFill) progressFill.style.transform = `scaleX(${safePercent / 100})`;
    }
}

export function completeQuestPill(
    questId: string,
    message: string,
    result: "success" | "error" | "cancelled"
): void {
    const row =
        questPills.get(questId) || (document.getElementById(`quest-row-${questId}`) as HTMLElement);
    if (!row) return;
    const pill = row.querySelector(".quest-pill");
    if (!pill) return;

    pill.classList.add("completed");
    stopPillTimer(questId);
    pill.classList.add(result === "success" ? "success" : "error");

    const titleEl = pill.querySelector(".quest-pill-title");
    if (titleEl) titleEl.textContent = message;

    const percentEl = pill.querySelector(".quest-pill-percent");
    if (percentEl) {
        if (result === "success") percentEl.textContent = "Done";
        else if (result === "cancelled") percentEl.textContent = "Cancelled";
        else percentEl.textContent = "Error";
    }

    const progressFill = pill.querySelector(".quest-pill-progress-fill") as HTMLElement;
    if (progressFill) progressFill.style.transform = "scaleX(1)";

    const slides = row.querySelectorAll(".quest-pill-slide");
    slides.forEach((s) => s.remove());

    const baseDuration = (settings.store.notificationDuration ?? 4) * 1000;
    const delay = baseDuration;
    setTimeout(() => {
        const currentRow =
            questPills.get(questId) ||
            (document.getElementById(`quest-row-${questId}`) as HTMLElement);
        if (!currentRow) return;
        const currentPill = currentRow.querySelector(".quest-pill");
        if (currentPill) {
            closePillElement(currentPill as HTMLElement);
            setTimeout(() => {
                try {
                    currentRow.remove();
                } catch {}
                questPills.delete(questId);
            }, 900);
        }
    }, delay);
}

export function removeQuestPill(questId: string): void {
    stopPillTimer(questId);
    const mapRow = questPills.get(questId);
    if (mapRow) {
        try {
            mapRow.remove();
        } catch {}
        questPills.delete(questId);
    }
    const domRow = document.getElementById(`quest-row-${questId}`);
    if (domRow) {
        try {
            domRow.remove();
        } catch {}
    }
}

function showPillSlideMessage(
    questId: string,
    message: string,
    type: "success" | "info" | "error" | "cancel"
): void {
    const row = questPills.get(questId);
    if (!row) {
        showSubPill("", message, type);
        return;
    }

    const existing = row.querySelector(".quest-pill-slide");
    if (existing) {
        closePillElement(existing as HTMLElement, 400);
    }

    const slide = document.createElement("div");
    slide.className = "quest-pill-slide";

    slide.innerHTML = `
        <div class="quest-pill-slide-icon ${type}">${PILL_ICONS[type]}</div>
        <span class="quest-pill-slide-text">${escapeHtml(message)}</span>
    `;

    row.appendChild(slide);

    const baseDuration = (settings.store.notificationDuration ?? 4) * 1000;
    const duration = baseDuration;
    setTimeout(() => {
        if (slide.parentElement) {
            closePillElement(slide, 400);
        }
    }, duration);
}

function showSubPill(
    title: string,
    body: string,
    type: "success" | "info" | "error" | "cancel"
): void {
    const container = getPillContainer();

    try {
        const visible = container.querySelectorAll(".quest-sub-pill:not(.hiding)");
        for (const el of Array.from(visible)) {
            const t = el.querySelector(".quest-sub-pill-title")?.textContent ?? "";
            const b = el.querySelector(".quest-sub-pill-body")?.textContent ?? "";
            if (el.classList.contains(type) && t === title && b === body) return;
        }
    } catch {}

    const maxStack = Math.min(Math.max(settings.store.pillMaxStack ?? 5, 1), 8);
    const existingPills = Array.from(
        container.querySelectorAll<HTMLElement>(".quest-sub-pill:not(.hiding)")
    );
    // Match Clonecord: keep the configured number of sub pills, drop the oldest.
    while (existingPills.length >= maxStack) {
        const oldest = existingPills.shift();
        if (!oldest) break;
        closePillElement(oldest, 500);
    }

    const baseDuration = (settings.store.notificationDuration ?? 4) * 1000;
    const duration = baseDuration;

    const pill = document.createElement("div");
    pill.className = `quest-sub-pill ${type}`;

    pill.innerHTML = `
        <div class="quest-sub-pill-icon ${type}">${PILL_ICONS[type] ?? PILL_ICONS.info}</div>
        <div class="quest-sub-pill-content">
            ${title ? `<div class="quest-sub-pill-title">${escapeHtml(title)}</div>` : ""}
            ${body ? `<div class="quest-sub-pill-body">${escapeHtml(body)}</div>` : ""}
        </div>
        <button class="quest-toast-close" title="Dismiss">&times;</button>
    `;

    container.appendChild(pill);
    pill.querySelector(".quest-toast-close")?.addEventListener("click", (event) => {
        event.stopPropagation();
        closePillElement(pill, 400);
    });

    setTimeout(() => {
        closePillElement(pill, 500);
    }, duration);
}

let lastShown: NotificationSignature | null = null;

export function notify(
    title: string,
    body: string,
    type: "success" | "info" | "error" | "cancel" = "info",
    questId?: string
): void {
    try {
        if (!settings.store.showNotifications) return;

        const key = buildNotificationKey(title, body, type, questId);
        if (shouldSuppressNotification(lastShown, key, Date.now())) return;
        lastShown = { key, at: Date.now() };

        if (questId && questPills.has(questId)) {
            showPillSlideMessage(questId, body, type);
        } else {
            showSubPill(title, body, type);
        }
    } catch (error) {
        log.error(`Notification error:`, error);
    }
}

export function cleanupAllPills(): void {
    lastShown = null;
    for (const questId of Array.from(questPillTimers.keys())) stopPillTimer(questId);
    questPills.forEach((row) => {
        try {
            row.remove();
        } catch (e) {
            log.warn(`Failed to remove pill:`, e);
        }
    });
    questPills.clear();

    const container = document.getElementById("vc-pill-container");
    if (container) {
        container.querySelectorAll(".quest-pill-row, .quest-sub-pill").forEach((el) => el.remove());
        if (container.children.length === 0) container.remove();
    }
    pillContainer = null;
}
