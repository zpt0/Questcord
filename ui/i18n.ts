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
import { messages as enMessages } from "./i18n/en-US";
import { messages as deMessages } from "./i18n/de";
import { messages as frMessages } from "./i18n/fr";
import { messages as esMessages } from "./i18n/es";
import { messages as itMessages } from "./i18n/it";
import { messages as ptMessages } from "./i18n/pt";
import { messages as ruMessages } from "./i18n/ru";
import { messages as jaMessages } from "./i18n/ja";
import { messages as koMessages } from "./i18n/ko";
import { messages as zhMessages } from "./i18n/zh";
import type { UiMessages, UiMessageKey } from "./i18n/types";

const LOCALES: Record<string, Partial<UiMessages>> = {
    "en-US": enMessages,
    de: deMessages,
    fr: frMessages,
    es: esMessages,
    it: itMessages,
    pt: ptMessages,
    ru: ruMessages,
    ja: jaMessages,
    ko: koMessages,
    zh: zhMessages,
};

export const DEFAULT_LOCALE = "en-US";
export const SUPPORTED_LOCALES = Object.keys(LOCALES);

export function resolveMessages(locale: string | undefined | null): UiMessages {
    const base = (locale ?? "").split("-")[0].toLowerCase();
    if (base && LOCALES[base]) {
        return { ...enMessages, ...LOCALES[base] } as UiMessages;
    }
    return enMessages as UiMessages;
}

export function translateMessage(
    locale: string | undefined | null,
    key: UiMessageKey,
    vars?: Record<string, string | number>
): string {
    const text = resolveMessages(locale)[key] ?? enMessages[key];
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (_match, name: string) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`
    );
}

export function getLocale(): string {
    try {
        return UserStore.getCurrentUser()?.locale || DEFAULT_LOCALE;
    } catch {
        return DEFAULT_LOCALE;
    }
}

export function t(key: UiMessageKey, vars?: Record<string, string | number>): string {
    return translateMessage(getLocale(), key, vars);
}

export { type UiMessageKey, type UiMessages };
