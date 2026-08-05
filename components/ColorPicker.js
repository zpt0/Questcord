import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { React, ReactDOM } from "@webpack/common";
function hsvToRgb(h, s, v) {
    s /= 100;
    v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0,
        g = 0,
        b = 0;
    if (h < 60) {
        r = c;
        g = x;
    } else if (h < 120) {
        r = x;
        g = c;
    } else if (h < 180) {
        g = c;
        b = x;
    } else if (h < 240) {
        g = x;
        b = c;
    } else if (h < 300) {
        r = x;
        b = c;
    } else {
        r = c;
        b = x;
    }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : (d / max) * 100;
    const v = max * 100;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) h = ((b - r) / d + 2) * 60;
        else h = ((r - g) / d + 4) * 60;
    }
    return [h, s, v];
}
function hexToRgb(hex) {
    const m = hex.replace("#", "").match(/.{2}/g);
    if (!m || m.length < 3) return [88, 101, 242];
    return [parseInt(m[0], 16), parseInt(m[1], 16), parseInt(m[2], 16)];
}
function rgbToHex(r, g, b) {
    return (
        "#" +
        [r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")
    );
}
function isValidHex(hex) {
    return /^#[0-9A-Fa-f]{6}$/.test(hex);
}
export function ColorPicker({ value, onChange }) {
    const [open, setOpen] = React.useState(false);
    const [hexInput, setHexInput] = React.useState(value);
    const [popoverPos, setPopoverPos] = React.useState(null);
    const popoverRef = React.useRef(null);
    const panelRef = React.useRef(null);
    const hueRef = React.useRef(null);
    const swatchRef = React.useRef(null);
    const [isDraggingPanel, setIsDraggingPanel] = React.useState(false);
    const [isDraggingHue, setIsDraggingHue] = React.useState(false);
    const [focusedRgb, setFocusedRgb] = React.useState(null);
    const [r, g, b] = hexToRgb(value);
    const [hue, sat, val] = rgbToHsv(r, g, b);
    React.useEffect(() => {
        setHexInput(value);
    }, [value]);
    React.useEffect(() => {
        if (!open) return;
        function handleClick(e) {
            const t = e.target;
            if (
                popoverRef.current &&
                !popoverRef.current.contains(t) &&
                swatchRef.current &&
                !swatchRef.current.contains(t)
            ) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);
    function updateFromHSV(h, s, v) {
        const [rr, gg, bb] = hsvToRgb(h, s, v);
        onChange(rgbToHex(rr, gg, bb));
    }
    function handlePanelMouse(e) {
        const rect = panelRef.current.getBoundingClientRect();
        const s = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const v = Math.max(0, Math.min(100, 100 - ((e.clientY - rect.top) / rect.height) * 100));
        updateFromHSV(hue, s, v);
    }
    function handleHueMouse(e) {
        const rect = hueRef.current.getBoundingClientRect();
        const h = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
        updateFromHSV(h, sat, val);
    }
    function handlePanelDown(e) {
        handlePanelMouse(e);
        setIsDraggingPanel(true);
        function onMove(ev) {
            if (!panelRef.current) return;
            const rect = panelRef.current.getBoundingClientRect();
            const s = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
            const v = Math.max(
                0,
                Math.min(100, 100 - ((ev.clientY - rect.top) / rect.height) * 100)
            );
            updateFromHSV(hue, s, v);
        }
        function onUp() {
            setIsDraggingPanel(false);
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }
    function handleHueDown(e) {
        handleHueMouse(e);
        setIsDraggingHue(true);
        function onMove(ev) {
            if (!hueRef.current) return;
            const rect = hueRef.current.getBoundingClientRect();
            const h = Math.max(0, Math.min(360, ((ev.clientX - rect.left) / rect.width) * 360));
            updateFromHSV(h, sat, val);
        }
        function onUp() {
            setIsDraggingHue(false);
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }
    function handleRgbChange(channel, val) {
        const clamped = Math.max(0, Math.min(255, val));
        const nr = channel === "r" ? clamped : r;
        const ng = channel === "g" ? clamped : g;
        const nb = channel === "b" ? clamped : b;
        onChange(rgbToHex(nr, ng, nb));
    }
    function handleHexInput(v) {
        setHexInput(v);
        if (isValidHex(v)) onChange(v.toUpperCase());
    }
    const hueRgb = hsvToRgb(hue, 100, 100);
    const hueColor = rgbToHex(hueRgb[0], hueRgb[1], hueRgb[2]);
    const panelStyle = {
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
    };
    return _jsxs("div", {
        style: { position: "relative", display: "inline-block" },
        children: [
            _jsx("div", {
                ref: swatchRef,
                onClick: () => {
                    if (!open && swatchRef.current) {
                        const rect = swatchRef.current.getBoundingClientRect();
                        setPopoverPos({ top: rect.bottom + 8, left: rect.left });
                    }
                    setOpen(!open);
                },
                style: {
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    backgroundColor: isValidHex(value) ? value : "#5865F2",
                    border: "2px solid rgba(255,255,255,0.15)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                    cursor: "pointer",
                    transition: "transform 0.15s",
                    flexShrink: 0,
                    userSelect: "none",
                },
            }),
            open && popoverPos && ReactDOM.createPortal(
                _jsxs("div", {
                    ref: popoverRef,
                    style: {
                        position: "fixed",
                        top: popoverPos.top,
                        left: popoverPos.left,
                        background: "#2b2d31",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 12,
                        padding: 12,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                        zIndex: 2147483647,
                        width: 240,
                    },
                    children: [
                        _jsx("div", {
                            ref: panelRef,
                            onMouseDown: handlePanelDown,
                            style: {
                                ...panelStyle,
                                width: "100%",
                                height: 160,
                                borderRadius: 8,
                                position: "relative",
                                cursor: "crosshair",
                                marginBottom: 10,
                                userSelect: "none",
                            },
                            children: _jsx("div", {
                                style: {
                                    position: "absolute",
                                    left: `${sat}%`,
                                    top: `${100 - val}%`,
                                    width: isDraggingPanel ? 16 : 14,
                                    height: isDraggingPanel ? 16 : 14,
                                    borderRadius: "50%",
                                    border: "2px solid white",
                                    boxShadow: isDraggingPanel
                                        ? "0 0 0 2px rgba(88,101,242,0.6), 0 0 8px rgba(0,0,0,0.5)"
                                        : "0 0 4px rgba(0,0,0,0.5)",
                                    transform: "translate(-50%, -50%)",
                                    pointerEvents: "none",
                                    transition: "width 0.1s, height 0.1s, box-shadow 0.1s",
                                },
                            }),
                        }),
                        _jsx("div", {
                            ref: hueRef,
                            onMouseDown: handleHueDown,
                            style: {
                                background:
                                    "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
                                width: "100%",
                                height: 14,
                                borderRadius: 7,
                                position: "relative",
                                cursor: "pointer",
                                marginBottom: 10,
                                userSelect: "none",
                            },
                            children: _jsx("div", {
                                style: {
                                    position: "absolute",
                                    top: "50%",
                                    left: `${(hue / 360) * 100}%`,
                                    width: isDraggingHue ? 20 : 18,
                                    height: isDraggingHue ? 20 : 18,
                                    borderRadius: "50%",
                                    border: "2px solid white",
                                    boxShadow: isDraggingHue
                                        ? "0 0 0 2px rgba(88,101,242,0.6), 0 0 8px rgba(0,0,0,0.5)"
                                        : "0 0 4px rgba(0,0,0,0.5)",
                                    transform: "translate(-50%, -50%)",
                                    pointerEvents: "none",
                                    transition: "width 0.1s, height 0.1s, box-shadow 0.1s",
                                },
                            }),
                        }),
                        _jsxs("div", {
                            style: { display: "flex", gap: 6, marginBottom: 8 },
                            children: [
                                [
                                    ["R", r, "r"],
                                    ["G", g, "g"],
                                    ["B", b, "b"],
                                ].map(([label, val, ch]) =>
                                    _jsxs(
                                        "label",
                                        {
                                            style: {
                                                flex: 1,
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 2,
                                                fontSize: 10,
                                                color: "#b5bac1",
                                                fontWeight: 600,
                                            },
                                            children: [
                                                label,
                                                _jsx("input", {
                                                    type: "number",
                                                    min: 0,
                                                    max: 255,
                                                    value: val,
                                                    onChange: (e) =>
                                                        handleRgbChange(
                                                            ch,
                                                            parseInt(e.target.value) || 0
                                                        ),
                                                    onFocus: () => setFocusedRgb(ch),
                                                    onBlur: () => setFocusedRgb(null),
                                                    style: {
                                                        width: "100%",
                                                        background: "#1e1f22",
                                                        border: focusedRgb === ch
                                                            ? "1px solid #5865F2"
                                                            : "1px solid rgba(255,255,255,0.1)",
                                                        borderRadius: 4,
                                                        color: "#dbdee1",
                                                        padding: "4px 0",
                                                        textAlign: "center",
                                                        fontSize: 12,
                                                        outline: "none",
                                                        boxSizing: "border-box",
                                                        boxShadow: focusedRgb === ch
                                                            ? "0 0 0 1px rgba(88,101,242,0.3)"
                                                            : "none",
                                                        transition: "border-color 0.15s, box-shadow 0.15s",
                                                    },
                                                }),
                                            ],
                                        },
                                        ch
                                    )
                                ),
                            ],
                        }),
                        _jsx("input", {
                            type: "text",
                            value: hexInput,
                            onChange: (e) => handleHexInput(e.target.value),
                            maxLength: 7,
                            placeholder: "#5865F2",
                            style: {
                                width: "100%",
                                background: "#1e1f22",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 6,
                                color: "#dbdee1",
                                padding: "6px 8px",
                                fontSize: 13,
                                fontFamily: "monospace",
                                outline: "none",
                                boxSizing: "border-box",
                                userSelect: "text",
                            },
                        }),
                    ],
                }),
                document.body
            ),
        ],
    });
}
