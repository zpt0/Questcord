declare module "@utils/lazyReact" {
    import type { ComponentType } from "react";

    export type LazyComponentWrapper<T> = T & {
        $$vencordGetWrappedComponent(): T;
    };

    /**
     * Wraps a component factory in a component whose factory is only invoked
     * on first render. Used to defer React access until `@webpack/common` has
     * assigned its asynchronously resolved React binding.
     */
    export function LazyComponent<T extends object = any>(
        factory: () => ComponentType<T>,
        attempts?: number
    ): LazyComponentWrapper<ComponentType<T>>;
}
