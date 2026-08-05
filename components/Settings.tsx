import "./settings.css";
import { classNameFactory } from "@utils/css";
import { Forms, Select, Slider } from "@webpack/common";
import { settings } from "../settings";
import { VersionDisplay } from "./VersionDisplay";
import { ColorPicker } from "./ColorPicker";

const cl = classNameFactory("vc-questcord-settings-");

function getDefaults(): Record<string, any> {
    const defaults: Record<string, any> = {};
    for (const [key, def] of Object.entries(settings.def as Record<string, any>)) {
        if (def.default !== undefined) {
            defaults[key] = def.default;
        }
    }
    return defaults;
}

const ALL_SETTINGS = getDefaults();

const CUSTOM_SETTINGS: Record<string, any> = {
    pillPosition: ALL_SETTINGS.pillPosition,
    pillBgColor: ALL_SETTINGS.pillBgColor,
    pillAccentColor: ALL_SETTINGS.pillAccentColor,
    pillTextColor: ALL_SETTINGS.pillTextColor,
    pillPercentColor: ALL_SETTINGS.pillPercentColor,
    pillBarBgColor: ALL_SETTINGS.pillBarBgColor,
    pillBorderColor: ALL_SETTINGS.pillBorderColor,
    pillBorderRadius: ALL_SETTINGS.pillBorderRadius,
    pillFontSize: ALL_SETTINGS.pillFontSize,
    pillOpacity: ALL_SETTINGS.pillOpacity,
    pillPadding: ALL_SETTINGS.pillPadding,
};

const POSITION_OPTIONS = [
    { label: "Top Left", value: "top-left" },
    { label: "Top Center", value: "top-center" },
    { label: "Top Right", value: "top-right" },
    { label: "Bottom Left", value: "bottom-left" },
    { label: "Bottom Center", value: "bottom-center" },
    { label: "Bottom Right", value: "bottom-right" },
];

function SettingSlider({
    settingKey,
    label,
    note,
    min,
    max,
    markers,
}: {
    settingKey: string;
    label: string;
    note?: string;
    min: number;
    max: number;
    markers?: number[];
}) {
    const value = settings.use([settingKey as any])[settingKey];
    return (
        <div className={cl("setting-item")}>
            <Forms.FormTitle>{label}</Forms.FormTitle>
            {note && <Forms.FormText style={{ marginBottom: 8 }}>{note}</Forms.FormText>}
            <Slider
                initialValue={value}
                onValueChange={(v: number) => (settings.store[settingKey] = v)}
                minValue={min}
                maxValue={max}
                markers={markers}
                onValueRender={(v: number) => `${v}${label.includes("Opacity") ? "%" : "px"}`}
            />
        </div>
    );
}

function SettingSelect({
    settingKey,
    label,
    note,
    options,
}: {
    settingKey: string;
    label: string;
    note?: string;
    options: Array<{ label: string; value: string }>;
}) {
    const value = settings.use([settingKey as any])[settingKey];
    return (
        <div className={cl("setting-item")}>
            <Forms.FormTitle>{label}</Forms.FormTitle>
            {note && <Forms.FormText style={{ marginBottom: 8 }}>{note}</Forms.FormText>}
            <Select
                options={options}
                select={(v: string) => (settings.store[settingKey] = v)}
                isSelected={(v: string) => v === value}
                serialize={(v: string) => v}
            />
        </div>
    );
}

function SettingColor({
    settingKey,
    label,
    note,
}: {
    settingKey: string;
    label: string;
    note?: string;
}) {
    const value = settings.use([settingKey as any])[settingKey];
    return (
        <div className={cl("setting-item")}>
            <div className={cl("color-row")}>
                <div className={cl("color-label")}>
                    <Forms.FormTitle>{label}</Forms.FormTitle>
                    {note && <Forms.FormText>{note}</Forms.FormText>}
                </div>
                <ColorPicker
                    value={value}
                    onChange={(hex: string) => (settings.store[settingKey] = hex)}
                />
            </div>
        </div>
    );
}

export function QuestSettings() {
    return (
        <div className={cl("root")}>
            <VersionDisplay />

            <Forms.FormSection title="Pill Position">
                <SettingSelect
                    settingKey="pillPosition"
                    label="Position"
                    note="Where quest progress pills appear on screen"
                    options={POSITION_OPTIONS}
                />
            </Forms.FormSection>

            <Forms.FormSection title="Colors">
                <SettingColor
                    settingKey="pillBgColor"
                    label="Background"
                    note="Pill background color"
                />
                <SettingColor
                    settingKey="pillAccentColor"
                    label="Accent"
                    note="Progress bars, spinners, highlights"
                />
                <SettingColor
                    settingKey="pillTextColor"
                    label="Text"
                    note="Pill title text color"
                />
                <SettingColor
                    settingKey="pillPercentColor"
                    label="Percent"
                    note="Progress percent text color"
                />
                <SettingColor
                    settingKey="pillBarBgColor"
                    label="Bar Background"
                    note="Progress bar track color"
                />
                <SettingColor
                    settingKey="pillBorderColor"
                    label="Border"
                    note="Pill border color"
                />
            </Forms.FormSection>

            <Forms.FormSection title="Appearance">
                <SettingSlider
                    settingKey="pillBorderRadius"
                    label="Corner Radius"
                    note="Pill corner roundness"
                    min={0}
                    max={32}
                    markers={[0, 8, 16, 24, 32]}
                />
                <SettingSlider
                    settingKey="pillFontSize"
                    label="Font Size"
                    note="Pill text size"
                    min={10}
                    max={20}
                    markers={[10, 12, 14, 16, 18, 20]}
                />
                <SettingSlider
                    settingKey="pillOpacity"
                    label="Opacity"
                    note="Pill background transparency"
                    min={50}
                    max={100}
                    markers={[50, 60, 70, 80, 85, 90, 95, 100]}
                />
                <SettingSlider
                    settingKey="pillPadding"
                    label="Padding"
                    note="Pill inner spacing"
                    min={4}
                    max={16}
                    markers={[4, 6, 8, 10, 12, 16]}
                />
            </Forms.FormSection>

            <Forms.FormSection title="Reset">
                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        className={cl("check-update-btn")}
                        style={{ flex: 1 }}
                        onClick={() => {
                            for (const [key, val] of Object.entries(CUSTOM_SETTINGS)) {
                                (settings.store as any)[key] = val;
                            }
                        }}
                    >
                        Reset Customization
                    </button>
                    <button
                        className={cl("check-update-btn")}
                        style={{ flex: 1 }}
                        onClick={() => {
                            for (const [key, val] of Object.entries(ALL_SETTINGS)) {
                                (settings.store as any)[key] = val;
                            }
                        }}
                    >
                        Reset All Settings
                    </button>
                </div>
            </Forms.FormSection>
        </div>
    );
}
