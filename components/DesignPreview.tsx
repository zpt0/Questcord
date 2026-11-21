import { React } from "@webpack/common";

import { LivePreviewSurface } from "../platform/settings";
import { settings } from "../settings";
import { hexToRgbParts, hexToRgba, POSITION_CLASSES } from "../ui/pillStyles";

const PREVIEW_KEYS = [
    "showProgressBar",
    "pillPosition",
    "pillStyle",
    "pillShowTimer",
    "pillBgColor",
    "pillAccentColor",
    "pillTextColor",
    "pillPercentColor",
    "pillBarBgColor",
    "pillBorderColor",
    "pillBorderRadius",
    "pillFontSize",
    "pillPadding",
    "pillOpacity",
    "pillMaxWidth",
] as const;

const PILL_ICONS: Record<string, string> = {
    success:
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 8h.01"/><path d="M12 11v5"/></svg>',
    cancel: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

function getDefaults(): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    try {
        for (const [key, def] of Object.entries((settings as any).def ?? {})) {
            const d = (def as any)?.default;
            if (d !== undefined) defaults[key] = d;
        }
    } catch {}
    return defaults;
}

function clamp(raw: unknown, min: number, max: number, fallback: number): number {
    const value = typeof raw === "number" && isFinite(raw) ? raw : fallback;
    return Math.round(Math.min(Math.max(value, min), max));
}

export function DesignPreview() {
    const values = settings.use([...PREVIEW_KEYS] as never) as Record<string, any>;
    const defaults = getDefaults();
    const read = (key: string) => (values[key] == null ? defaults[key] : values[key]);

    const rawPosition = String(read("pillPosition") ?? "top-center");
    const positionClass = POSITION_CLASSES.includes(`qc-pos-${rawPosition}`)
        ? `qc-pos-${rawPosition}`
        : "qc-pos-top-center";
    const position = positionClass.replace("qc-pos-", "");

    const rawStyle = String(read("pillStyle") ?? "glass");
    const style = ["glass", "solid", "minimal"].includes(rawStyle) ? rawStyle : "glass";

    const opacity = clamp(read("pillOpacity") ?? 85, 0, 100, 85) / 100;
    const radius = clamp(read("pillBorderRadius") ?? 10, 0, 32, 10);
    const fontSize = clamp(read("pillFontSize") ?? 13, 8, 24, 13);
    const padding = clamp(read("pillPadding") ?? 10, 2, 24, 10);
    const maxWidth = clamp(read("pillMaxWidth") ?? 400, 200, 800, 400);
    const accent = String(read("pillAccentColor") ?? "#5865F2");
    const showTimer = read("pillShowTimer") !== false;
    const showProgressBar = read("showProgressBar") !== false;

    // Same classes and --qc-* variables as the live renderer. Setting them here
    // means the preview uses the real pill CSS and updates with every change.
    const containerStyle: React.CSSProperties & Record<string, string | number> = {
        position: "relative",
        top: "auto",
        right: "auto",
        bottom: "auto",
        left: "auto",
        transform: "none",
        width: "100%",
        maxWidth,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 10,
        pointerEvents: "auto",
        "--qc-accent": accent,
        "--qc-accent-rgb": hexToRgbParts(accent),
        "--qc-bg": hexToRgba(String(read("pillBgColor") ?? "#000000"), opacity),
        "--qc-text": String(read("pillTextColor") ?? "#FFFFFF"),
        "--qc-percent": String(read("pillPercentColor") ?? "#43b581"),
        "--qc-bar-bg": String(read("pillBarBgColor") ?? "#333333"),
        "--qc-border": String(read("pillBorderColor") ?? "rgba(255,255,255,0.08)"),
        "--qc-radius": `${radius}px`,
        "--qc-font-size": `${fontSize}px`,
        "--qc-padding": `${padding}px`,
        "--qc-max-width": `${maxWidth}px`,
    };

    return (
        <LivePreviewSurface
            meta={`${style} · ${position} · all pill types · values update instantly`}
        >
            <div
                className={`vc-pill-container ${positionClass}`}
                data-style={style}
                style={containerStyle}
            >
                <div className="quest-pill-row">
                    <div className="quest-pill always-expanded">
                        <div className="quest-pill-compact">
                            <div className="quest-pill-spinner" />
                            <span className="quest-pill-title">Daily Quest</span>
                            {showTimer && <span className="quest-pill-timer">12s</span>}
                            <span className="quest-pill-percent">48%</span>
                        </div>
                        <div className="quest-pill-expanded">
                            <div className="quest-pill-expanded-inner">
                                <div className="quest-pill-body">
                                    Viewing your daily quest progress
                                </div>
                                {showProgressBar && (
                                    <div className="quest-pill-progress-bar">
                                        <div
                                            className="quest-pill-progress-fill"
                                            style={{ transform: "scaleX(0.48)" }}
                                        />
                                    </div>
                                )}
                                <div className="quest-pill-actions">
                                    <button className="quest-btn quest-cancel-btn">Cancel</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="quest-sub-pill success">
                    <div
                        className="quest-sub-pill-icon success"
                        dangerouslySetInnerHTML={{ __html: PILL_ICONS.success }}
                    />
                    <div className="quest-sub-pill-content">
                        <div className="quest-sub-pill-title">Quest completed</div>
                        <div className="quest-sub-pill-body">Reward claimed automatically</div>
                    </div>
                    <button className="quest-toast-close" title="Dismiss">
                        &times;
                    </button>
                </div>

                <div className="quest-sub-pill info">
                    <div
                        className="quest-sub-pill-icon info"
                        dangerouslySetInnerHTML={{ __html: PILL_ICONS.info }}
                    />
                    <div className="quest-sub-pill-content">
                        <div className="quest-sub-pill-title">Quest reminder</div>
                        <div className="quest-sub-pill-body">Progress updates appear here</div>
                    </div>
                    <button className="quest-toast-close" title="Dismiss">
                        &times;
                    </button>
                </div>

                <div className="quest-sub-pill error">
                    <div
                        className="quest-sub-pill-icon error"
                        dangerouslySetInnerHTML={{ __html: PILL_ICONS.error }}
                    />
                    <div className="quest-sub-pill-content">
                        <div className="quest-sub-pill-title">Quest paused</div>
                        <div className="quest-sub-pill-body">Rate limit reached, retrying soon</div>
                    </div>
                    <button className="quest-toast-close" title="Dismiss">
                        &times;
                    </button>
                </div>

                <div className="quest-sub-pill cancel">
                    <div
                        className="quest-sub-pill-icon cancel"
                        dangerouslySetInnerHTML={{ __html: PILL_ICONS.cancel }}
                    />
                    <div className="quest-sub-pill-content">
                        <div className="quest-sub-pill-title">Quest cancelled</div>
                        <div className="quest-sub-pill-body">No changes were made</div>
                    </div>
                    <button className="quest-toast-close" title="Dismiss">
                        &times;
                    </button>
                </div>
            </div>
        </LivePreviewSurface>
    );
}
