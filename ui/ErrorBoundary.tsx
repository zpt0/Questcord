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

import { LazyComponent } from "@utils/lazyReact";
import { React } from "@webpack/common";

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

// must stay lazy: react from @webpack/common is not ready when this module is evaluated,
// a module scope component subclass would break the plugin on startup
export const ErrorBoundary = LazyComponent<ErrorBoundaryProps>(
    () =>
        class ErrorBoundary extends React.Component<ErrorBoundaryProps, { hasError: boolean }> {
            state = { hasError: false };

            static getDerivedStateFromError() {
                return { hasError: true };
            }

            componentDidCatch(error: unknown, info: unknown) {
                console.error("Questcord component error:", error, info);
            }

            render(): React.ReactNode {
                return this.state.hasError ? null : this.props.children;
            }
        }
);
