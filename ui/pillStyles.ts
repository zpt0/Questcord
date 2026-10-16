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

import { settings } from "../settings";

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

export function applyPillContainerStyle(el: HTMLElement): void {
    el.classList.remove(...POSITION_CLASSES);
    const pos = settings.store.pillPosition || "top-center";
    el.classList.add(`qc-pos-${pos}`);

    const opacity = (settings.store.pillOpacity ?? 85) / 100;
    const bgColor = settings.store.pillBgColor || "#000000";

    el.style.setProperty("--qc-accent", settings.store.pillAccentColor || "#5865F2");
    el.style.setProperty("--qc-bg", hexToRgba(bgColor, opacity));
    el.style.setProperty("--qc-bg-hover", hexToRgba(bgColor, Math.min(1, opacity + 0.1)));
    el.style.setProperty("--qc-text", settings.store.pillTextColor || "#FFFFFF");
    el.style.setProperty("--qc-percent", settings.store.pillPercentColor || "#43b581");
    el.style.setProperty("--qc-bar-bg", settings.store.pillBarBgColor || "#333333");
    el.style.setProperty("--qc-border", settings.store.pillBorderColor || "rgba(255,255,255,0.08)");
    el.style.setProperty("--qc-radius", `${settings.store.pillBorderRadius ?? 24}px`);
    el.style.setProperty("--qc-font-size", `${settings.store.pillFontSize ?? 14}px`);
    el.style.setProperty("--qc-padding", `${settings.store.pillPadding ?? 8}px`);
}
