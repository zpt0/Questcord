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

import { settings } from "../settings";

// values must match the qc-pos-* selectors in styles.css
export const POSITION_CLASSES = [
    "qc-pos-top-left",
    "qc-pos-top-center",
    "qc-pos-top-right",
    "qc-pos-bottom-left",
    "qc-pos-bottom-center",
    "qc-pos-bottom-right",
];

export function hexToRgba(hex: string, alpha: number): string {
    const m = hex.replace("#", "").match(/.{2}/g);
    if (!m || m.length < 3) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(m[0], 16);
    const g = parseInt(m[1], 16);
    const b = parseInt(m[2], 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

/** "r,g,b" parts for rgba(var(--qc-accent-rgb), alpha) in styles.css. */
export function hexToRgbParts(hex: string): string {
    const m = hex.replace("#", "").match(/.{2}/g);
    if (!m || m.length < 3) return "88,101,242";
    return `${parseInt(m[0], 16)},${parseInt(m[1], 16)},${parseInt(m[2], 16)}`;
}

export function applyPillContainerStyle(el: HTMLElement): void {
    el.classList.remove(...POSITION_CLASSES);
    const pos = POSITION_CLASSES.includes(`qc-pos-${settings.store.pillPosition}`)
        ? settings.store.pillPosition
        : "top-center";
    el.classList.add(`qc-pos-${pos}`);

    const style = ["glass", "solid", "minimal"].includes(settings.store.pillStyle)
        ? settings.store.pillStyle
        : "glass";
    el.dataset.style = style;

    const clamp = (raw: unknown, min: number, max: number, fallback: number) => {
        const value = typeof raw === "number" && isFinite(raw) ? raw : fallback;
        return Math.round(Math.min(Math.max(value, min), max));
    };

    const opacity = clamp(settings.store.pillOpacity, 0, 100, 85) / 100;
    const bgColor = settings.store.pillBgColor || "#000000";
    const accent = settings.store.pillAccentColor || "#5865F2";

    el.style.setProperty("--qc-accent", accent);
    el.style.setProperty("--qc-accent-rgb", hexToRgbParts(accent));
    el.style.setProperty("--qc-bg", hexToRgba(bgColor, opacity));
    el.style.setProperty("--qc-bg-hover", hexToRgba(bgColor, Math.min(1, opacity + 0.1)));
    el.style.setProperty("--qc-text", settings.store.pillTextColor || "#FFFFFF");
    el.style.setProperty("--qc-percent", settings.store.pillPercentColor || "#43b581");
    el.style.setProperty("--qc-bar-bg", settings.store.pillBarBgColor || "#333333");
    el.style.setProperty("--qc-border", settings.store.pillBorderColor || "rgba(255,255,255,0.08)");
    el.style.setProperty("--qc-radius", `${clamp(settings.store.pillBorderRadius, 0, 32, 10)}px`);
    el.style.setProperty("--qc-font-size", `${clamp(settings.store.pillFontSize, 8, 24, 13)}px`);
    el.style.setProperty("--qc-padding", `${clamp(settings.store.pillPadding, 2, 24, 10)}px`);
    el.style.setProperty(
        "--qc-max-width",
        `${clamp(settings.store.pillMaxWidth, 200, 800, 400)}px`
    );
}
