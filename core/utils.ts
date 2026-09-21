import { activeQuests, getProgressBarKey } from "./state";
export function safeTimeout(
    callback: () => void,
    delay: number,
    questId: string,
    userId: string
): number {
    const timeoutId = window.setTimeout(callback, delay);
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.timeoutIds.push(timeoutId);
    }
    return timeoutId;
}
export function safeInterval(
    callback: () => void,
    interval: number,
    questId: string,
    userId: string
): number {
    const intervalId = window.setInterval(callback, interval);
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.intervalIds.push(intervalId);
    }
    return intervalId;
}
export function clearQuestTimers(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.timeoutIds.forEach((id) => clearTimeout(id));
        questData.intervalIds.forEach((id) => clearInterval(id));
        questData.timeoutIds = [];
        questData.intervalIds = [];
    }
}
export function compareVersions(v1: string, v2: string): number {
    const clean1 = v1.replace(/[^0-9.]/g, "");
    const clean2 = v2.replace(/[^0-9.]/g, "");
    const parts1 = clean1.split(".").map((n) => parseInt(n) || 0);
    const parts2 = clean2.split(".").map((n) => parseInt(n) || 0);
    const maxLength = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < maxLength; i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

type ConsoleMethods = "log" | "warn" | "error" | "debug";
const noop = () => {};

export function suppressConsole(
    ...methods: ConsoleMethods[]
): Record<string, (...args: any[]) => any> {
    const originals: Record<string, (...args: any[]) => any> = {};
    for (const m of methods) {
        originals[m] = console[m];
        (console as any)[m] = noop;
    }
    return originals;
}

export function restoreConsole(originals: Record<string, (...args: any[]) => any>): void {
    for (const [method, fn] of Object.entries(originals)) {
        (console as any)[method] = fn;
    }
}
export function getThemeVariables() {
    const isDark = document.documentElement.classList.contains("theme-dark");
    return {
        isDark,
        background: isDark ? "#2f3136" : "#ffffff",
        backgroundSecondary: isDark ? "#292b2f" : "#f2f3f5",
        backgroundSecondaryAlt: isDark ? "#292b2f" : "#ebedef",
        backgroundTertiary: isDark ? "#202225" : "#e3e5e8",
        headerPrimary: isDark ? "#ffffff" : "#060607",
        textNormal: isDark ? "#dcddde" : "#2e3338",
        textMuted: isDark ? "#b9bbbe" : "#4e5058",
        brandColor: "#5865f2",
        dangerColor: "#ed4245",
        successColor: "#43b581",
    };
}

export type ReleaseInlineNode =
    | { kind: "text"; text: string }
    | { kind: "bold"; children: ReleaseInlineNode[] }
    | { kind: "italic"; children: ReleaseInlineNode[] }
    | { kind: "strike"; children: ReleaseInlineNode[] }
    | { kind: "code"; text: string }
    | { kind: "link"; text: string; url: string };

export type ReleaseBlockNode =
    | { kind: "heading"; level: number; text: string }
    | { kind: "paragraph"; lines: string[] }
    | { kind: "list"; ordered: boolean; items: string[] }
    | { kind: "code"; text: string }
    | { kind: "quote"; lines: string[] };

/** Only http(s) URLs become clickable anchors; everything else stays plain text. */
export function isSafeReleaseUrl(url: string): boolean {
    return /^https?:\/\/[^\s)]+$/i.test(url);
}

/**
 * Split a single line of GitHub markdown into inline nodes (bold, italic,
 * strikethrough, code spans, links, plain text). Code span content is always
 * literal; everything else recurses so nesting works. The regex is built per
 * call because parsing recurses into itself.
 */
export function parseReleaseInline(text: string): ReleaseInlineNode[] {
    const tokenRe =
        /(\*\*\*(.+?)\*\*\*)|(\*\*(.+?)\*\*)|(~~(.+?)~~)|(`[^`\n]+`)|(\*([^*\n]+?)\*)|((?<![A-Za-z0-9_])_([^_\n]+?)_(?![A-Za-z0-9_]))|(\[([^\]\n]+)\]\(([^)\s]+)\))|(https?:\/\/[^\s<>\]`]+)/g;
    const nodes: ReleaseInlineNode[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(text)) !== null) {
        if (match.index > last) nodes.push({ kind: "text", text: text.slice(last, match.index) });
        last = match.index + match[0].length;
        if (match[1] !== undefined) {
            nodes.push({ kind: "bold", children: parseReleaseInline(match[2]) });
        } else if (match[3] !== undefined) {
            nodes.push({ kind: "bold", children: parseReleaseInline(match[4]) });
        } else if (match[5] !== undefined) {
            nodes.push({ kind: "strike", children: parseReleaseInline(match[6]) });
        } else if (match[7] !== undefined) {
            nodes.push({ kind: "code", text: match[7].slice(1, -1) });
        } else if (match[8] !== undefined) {
            nodes.push({ kind: "italic", children: parseReleaseInline(match[9]) });
        } else if (match[10] !== undefined) {
            nodes.push({ kind: "italic", children: parseReleaseInline(match[11]) });
        } else if (match[12] !== undefined) {
            if (isSafeReleaseUrl(match[14])) {
                nodes.push({ kind: "link", text: match[13], url: match[14] });
            } else {
                nodes.push({ kind: "text", text: match[0] });
            }
        } else if (match[15] !== undefined) {
            // Bare URL: trim trailing sentence punctuation, keep the rest clickable.
            let url = match[15];
            const trailing = url.match(/[.,;:!?'"]+$/);
            let trail = "";
            if (trailing) {
                trail = trailing[0];
                url = url.slice(0, -trail.length);
            }
            nodes.push({ kind: "link", text: url, url });
            if (trail) nodes.push({ kind: "text", text: trail });
        }
    }
    if (last < text.length) nodes.push({ kind: "text", text: text.slice(last) });
    return nodes;
}

/**
 * Split GitHub release notes into block nodes (headings, paragraphs, lists,
 * fenced code blocks, quotes). Horizontal rules are dropped — surrounding
 * spacing stays. Unclosed fences are treated as code to the end.
 */
export function parseReleaseBlocks(notes: string): ReleaseBlockNode[] {
    const normalized = (notes || "").replace(/\r\n/g, "\n").trim();
    if (!normalized) return [];
    const blocks: ReleaseBlockNode[] = [];
    let paragraph: string[] = [];
    let listItems: string[] | null = null;
    let listOrdered = false;
    let quoteLines: string[] | null = null;
    let fenceLines: string[] | null = null;

    const flushParagraph = () => {
        if (paragraph.length > 0) blocks.push({ kind: "paragraph", lines: paragraph });
        paragraph = [];
    };
    const flushList = () => {
        if (listItems && listItems.length > 0) {
            blocks.push({ kind: "list", ordered: listOrdered, items: listItems });
        }
        listItems = null;
    };
    const flushQuote = () => {
        if (quoteLines && quoteLines.length > 0) {
            blocks.push({ kind: "quote", lines: quoteLines });
        }
        quoteLines = null;
    };

    for (const line of normalized.split("\n")) {
        if (fenceLines !== null) {
            if (/^\s*```/.test(line)) {
                blocks.push({ kind: "code", text: fenceLines.join("\n") });
                fenceLines = null;
            } else {
                fenceLines.push(line);
            }
            continue;
        }
        if (/^\s*```/.test(line)) {
            flushParagraph();
            flushList();
            flushQuote();
            fenceLines = [];
            continue;
        }
        if (/^\s*$/.test(line)) {
            flushParagraph();
            flushList();
            flushQuote();
            continue;
        }
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            flushParagraph();
            flushList();
            flushQuote();
            blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
            continue;
        }
        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
            flushParagraph();
            flushList();
            flushQuote();
            continue;
        }
        const quote = line.match(/^\s*>\s?(.*)$/);
        if (quote) {
            flushParagraph();
            flushList();
            if (quoteLines === null) quoteLines = [];
            quoteLines.push(quote[1]);
            continue;
        }
        const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
        const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
        if (unordered || ordered) {
            flushParagraph();
            flushQuote();
            const isOrdered = ordered !== null;
            const item = (unordered?.[1] ?? ordered?.[1] ?? "").trim();
            if (listItems === null || listOrdered !== isOrdered) {
                flushList();
                listItems = [];
                listOrdered = isOrdered;
            }
            listItems.push(item);
            continue;
        }
        flushList();
        flushQuote();
        paragraph.push(line.trim());
    }
    if (fenceLines !== null) blocks.push({ kind: "code", text: fenceLines.join("\n") });
    flushParagraph();
    flushList();
    flushQuote();
    return blocks;
}
