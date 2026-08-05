import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { React } from "@webpack/common";
import { PLUGIN_VERSION, UPDATE_CHECK_URL } from "../constants";
import { compareVersions } from "../core/utils";
import { showUpdateModal } from "./UpdateModal";
export function VersionDisplay() {
    const [updateStatus, setUpdateStatus] = React.useState(null);
    const [isChecking, setIsChecking] = React.useState(false);
    const checkUpdate = async () => {
        setIsChecking(true);
        setUpdateStatus("Checking...");
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(UPDATE_CHECK_URL, {
                signal: controller.signal,
                headers: { Accept: "application/vnd.github.v3+json" },
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                setUpdateStatus("Failed to check");
                setIsChecking(false);
                return;
            }
            const data = await response.json();
            let latestVersion = data.tag_name || data.name || "";
            latestVersion = latestVersion.replace(/^v/i, "").trim();
            if (!latestVersion) {
                setUpdateStatus("No releases found");
                setIsChecking(false);
                return;
            }
            const comparison = compareVersions(latestVersion, PLUGIN_VERSION);
            if (comparison > 0) {
                setUpdateStatus(`Update available: v${latestVersion}`);
                setTimeout(() => {
                    showUpdateModal(latestVersion, data.body || "No release notes available.");
                }, 500);
            } else {
                setUpdateStatus("You're up to date!");
            }
        } catch (e) {
            setUpdateStatus("Check failed");
        }
        setIsChecking(false);
    };
    const getStatusColor = () => {
        if (!updateStatus) return "var(--text-muted)";
        if (updateStatus.includes("available")) return "#ffaa00";
        if (updateStatus.includes("up to date")) return "#00ff00";
        if (updateStatus.includes("failed") || updateStatus.includes("Failed")) return "#f04747";
        return "var(--text-muted)";
    };
    return _jsxs("div", {
        className: "vc-questcord-settings-version-container",
        children: [
            _jsxs("div", {
                className: "vc-questcord-settings-version-info",
                children: [
                    _jsx("div", {
                        className: "vc-questcord-settings-version-title",
                        style: { color: "#ffffff" },
                        children: "QuestCord",
                    }),
                    _jsxs("div", {
                        className: "vc-questcord-settings-version-subtitle",
                        style: { color: "#58b9ff" },
                        children: [
                            "Version:",
                            " ",
                            _jsxs("span", {
                                className: "vc-questcord-settings-version-number",
                                style: { color: "#58b9ff" },
                                children: ["v", PLUGIN_VERSION],
                            }),
                            updateStatus &&
                                _jsxs("span", {
                                    className: "vc-questcord-settings-version-status",
                                    style: { color: getStatusColor() },
                                    children: ["\u00A0\u2022 ", updateStatus],
                                }),
                        ],
                    }),
                ],
            }),
            _jsx("button", {
                className: "vc-questcord-settings-check-update-btn",
                onClick: checkUpdate,
                disabled: isChecking,
                children: isChecking ? "Checking..." : "Check for Updates",
            }),
        ],
    });
}
