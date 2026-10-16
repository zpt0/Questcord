/**
 * Vitest stub for the `@webpack/common` module: provides the pieces used by
 * testable modules (see `resolve.alias` in vitest.config.ts).
 */
export const UserStore = {
    getCurrentUser(): { id: string; locale: string } | undefined {
        return undefined;
    },
};
