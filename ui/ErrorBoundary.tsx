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

/**
 * Error boundary for the quest UI injected by this plugin.
 *
 * The class MUST NOT be defined at module scope: Vencord imports userplugins
 * eagerly (`import "~plugins"` at the top of its entry module) and assigns the
 * global `Vencord` object only after that module finished evaluating, while
 * `@webpack/common`'s `React` is itself assigned asynchronously via `waitFor`.
 * A top-level `class ... extends React.Component` therefore runs before React
 * exists, throws, and aborts Vencord's entry module — leaving the global
 * `Vencord` undefined and breaking the whole client.
 *
 * `LazyComponent` defers the class creation to the first render, when React is
 * guaranteed to be available. This mirrors Vencord's own
 * `components/ErrorBoundary`. React is imported from @webpack/common (Vencord
 * bans importing "react").
 */
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
