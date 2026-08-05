import { React } from "@webpack/common";
import { PLUGIN_VERSION, UPDATE_CHECK_URL } from "../constants";
import { checkForUpdate, getThemeVariables } from "../core/utils";
import { showUpdateModal } from "./UpdateModal";

export function VersionDisplay() {
    const [updateStatus, setUpdateStatus] = React.useState<string | null>(null);
    const [isChecking, setIsChecking] = React.useState(false);
    const theme = getThemeVariables();
    const checkUpdate = async () => {
        setIsChecking(true);
        setUpdateStatus("Checking...");
        const result = await checkForUpdate(PLUGIN_VERSION, UPDATE_CHECK_URL, 5000);
        if (result.error) {
            setUpdateStatus("Check failed");
        } else if (result.updateAvailable && result.latestVersion) {
            setUpdateStatus(`Update available: v${result.latestVersion}`);
            setTimeout(() => {
                showUpdateModal(
                    result.latestVersion!,
                    result.releaseNotes || "No release notes available."
                );
            }, 500);
        } else {
            setUpdateStatus("You're up to date!");
        }
        setIsChecking(false);
    };
    const getStatusColor = () => {
        if (!updateStatus) return "var(--text-muted)";
        if (updateStatus.includes("available")) return "#ffaa00";
        if (updateStatus.includes("up to date")) return "#00ff00";
        if (updateStatus.includes("failed") || updateStatus.includes("Failed"))
            return theme.dangerColor;
        return "var(--text-muted)";
    };
    return (
        <div className="vc-questcord-settings-version-container">
            <div className="vc-questcord-settings-version-info">
                <div className="vc-questcord-settings-version-title" style={{ color: "#ffffff" }}>
                    QuestCord
                </div>
                <div
                    className="vc-questcord-settings-version-subtitle"
                    style={{ color: "#58b9ff" }}
                >
                    Version:{" "}
                    <span
                        className="vc-questcord-settings-version-number"
                        style={{ color: "#58b9ff" }}
                    >
                        v{PLUGIN_VERSION}
                    </span>
                    {updateStatus && (
                        <span
                            className="vc-questcord-settings-version-status"
                            style={{ color: getStatusColor() }}
                        >
                            &nbsp;• {updateStatus}
                        </span>
                    )}
                </div>
            </div>
            <button
                className="vc-questcord-settings-check-update-btn"
                onClick={checkUpdate}
                disabled={isChecking}
            >
                {isChecking ? "Checking..." : "Check for Updates"}
            </button>
        </div>
    );
}
