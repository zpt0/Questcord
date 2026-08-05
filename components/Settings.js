import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import "./settings.css";
import { classNameFactory } from "@utils/css";
import { Forms, Select, Slider, Switch } from "@webpack/common";
import { settings } from "../settings";
import { PLUGIN_VERSION } from "../constants";
import { VersionDisplay } from "./VersionDisplay";
import { ColorPicker } from "./ColorPicker";
const cl = classNameFactory("vc-questcord-settings-");
const ALL_SETTINGS = {
    showNotifications: true,
    notificationDuration: 4,
    autoResumeAfterReload: true,
    showProgressBar: true,
    autoDismissQuestPopups: true,
    debugMode: false,
    showUpdateNotifications: true,
    pillPosition: "top-center",
    pillBgColor: "#000000",
    pillAccentColor: "#5865F2",
    pillTextColor: "#FFFFFF",
    pillPercentColor: "#43b581",
    pillBarBgColor: "#333333",
    pillBorderColor: "rgba(255,255,255,0.08)",
    pillBorderRadius: 24,
    pillFontSize: 14,
    pillOpacity: 85,
    pillPadding: 8,
};
const CUSTOM_SETTINGS = {
    pillPosition: "top-center",
    pillBgColor: "#000000",
    pillAccentColor: "#5865F2",
    pillTextColor: "#FFFFFF",
    pillPercentColor: "#43b581",
    pillBarBgColor: "#333333",
    pillBorderColor: "rgba(255,255,255,0.08)",
    pillBorderRadius: 24,
    pillFontSize: 14,
    pillOpacity: 85,
    pillPadding: 8,
};
const POSITION_OPTIONS = [
    { label: "Top Left", value: "top-left" },
    { label: "Top Center", value: "top-center" },
    { label: "Top Right", value: "top-right" },
    { label: "Bottom Left", value: "bottom-left" },
    { label: "Bottom Center", value: "bottom-center" },
    { label: "Bottom Right", value: "bottom-right" },
];
function SettingSwitch({ settingKey, label, note }) {
    const value = settings.use([settingKey])[settingKey];
    return _jsx("div", {
        className: cl("setting-item"),
        children: _jsx(Switch, {
            value: value,
            onChange: (v) => (settings.store[settingKey] = v),
            note: note,
            hideBorder: true,
            children: label,
        }),
    });
}
function SettingSlider({ settingKey, label, note, min, max, markers }) {
    const value = settings.use([settingKey])[settingKey];
    return _jsxs("div", {
        className: cl("setting-item"),
        children: [
            _jsx(Forms.FormTitle, { children: label }),
            note && _jsx(Forms.FormText, { style: { marginBottom: 8 }, children: note }),
            _jsx(Slider, {
                initialValue: value,
                onValueChange: (v) => (settings.store[settingKey] = v),
                minValue: min,
                maxValue: max,
                markers: markers,
                onValueRender: (v) => `${v}${label.includes("Opacity") ? "%" : "px"}`,
            }),
        ],
    });
}
function SettingSelect({ settingKey, label, note, options }) {
    const value = settings.use([settingKey])[settingKey];
    return _jsxs("div", {
        className: cl("setting-item"),
        children: [
            _jsx(Forms.FormTitle, { children: label }),
            note && _jsx(Forms.FormText, { style: { marginBottom: 8 }, children: note }),
            _jsx(Select, {
                options: options,
                select: (v) => (settings.store[settingKey] = v),
                isSelected: (v) => v === value,
                serialize: (v) => v,
            }),
        ],
    });
}
function SettingColor({ settingKey, label, note }) {
    const value = settings.use([settingKey])[settingKey];
    return _jsx("div", {
        className: cl("setting-item"),
        children: _jsxs("div", {
            className: cl("color-row"),
            children: [
                _jsxs("div", {
                    className: cl("color-label"),
                    children: [
                        _jsx(Forms.FormTitle, { children: label }),
                        note && _jsx(Forms.FormText, { children: note }),
                    ],
                }),
                _jsx(ColorPicker, {
                    value: value,
                    onChange: (hex) => (settings.store[settingKey] = hex),
                }),
            ],
        }),
    });
}
export function QuestSettings() {
    return _jsxs("div", {
        className: cl("root"),
        children: [
            _jsx(VersionDisplay, {}),
            _jsxs(Forms.FormSection, {
                title: "Pill Position",
                children: [
                    _jsx(SettingSelect, {
                        settingKey: "pillPosition",
                        label: "Position",
                        note: "Where quest progress pills appear on screen",
                        options: POSITION_OPTIONS,
                    }),
                ],
            }),
            _jsxs(Forms.FormSection, {
                title: "Colors",
                children: [
                    _jsx(SettingColor, {
                        settingKey: "pillBgColor",
                        label: "Background",
                        note: "Pill background color",
                    }),
                    _jsx(SettingColor, {
                        settingKey: "pillAccentColor",
                        label: "Accent",
                        note: "Progress bars, spinners, highlights",
                    }),
                    _jsx(SettingColor, {
                        settingKey: "pillTextColor",
                        label: "Text",
                        note: "Pill title text color",
                    }),
                    _jsx(SettingColor, {
                        settingKey: "pillPercentColor",
                        label: "Percent",
                        note: "Progress percent text color",
                    }),
                    _jsx(SettingColor, {
                        settingKey: "pillBarBgColor",
                        label: "Bar Background",
                        note: "Progress bar track color",
                    }),
                    _jsx(SettingColor, {
                        settingKey: "pillBorderColor",
                        label: "Border",
                        note: "Pill border color",
                    }),
                ],
            }),
            _jsxs(Forms.FormSection, {
                title: "Appearance",
                children: [
                    _jsx(SettingSlider, {
                        settingKey: "pillBorderRadius",
                        label: "Corner Radius",
                        note: "Pill corner roundness",
                        min: 0,
                        max: 32,
                        markers: [0, 8, 16, 24, 32],
                    }),
                    _jsx(SettingSlider, {
                        settingKey: "pillFontSize",
                        label: "Font Size",
                        note: "Pill text size",
                        min: 10,
                        max: 20,
                        markers: [10, 12, 14, 16, 18, 20],
                    }),
                    _jsx(SettingSlider, {
                        settingKey: "pillOpacity",
                        label: "Opacity",
                        note: "Pill background transparency",
                        min: 50,
                        max: 100,
                        markers: [50, 60, 70, 80, 85, 90, 95, 100],
                    }),
                    _jsx(SettingSlider, {
                        settingKey: "pillPadding",
                        label: "Padding",
                        note: "Pill inner spacing",
                        min: 4,
                        max: 16,
                        markers: [4, 6, 8, 10, 12, 16],
                    }),
                ],
            }),
            _jsxs(Forms.FormSection, {
                title: "Reset",
                children: _jsxs("div", {
                    style: { display: "flex", gap: 8 },
                    children: [
                        _jsx("button", {
                            className: cl("check-update-btn"),
                            style: { flex: 1 },
                            onClick: () => {
                                for (const [key, val] of Object.entries(CUSTOM_SETTINGS)) {
                                    settings.store[key] = val;
                                }
                            },
                            children: "Reset Customization",
                        }),
                        _jsx("button", {
                            className: cl("check-update-btn"),
                            style: { flex: 1 },
                            onClick: () => {
                                for (const [key, val] of Object.entries(ALL_SETTINGS)) {
                                    settings.store[key] = val;
                                }
                            },
                            children: "Reset All Settings",
                        }),
                    ],
                }),
            }),
        ],
    });
}
