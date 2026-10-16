declare module "@utils/lazyReact" {
    import type { ComponentType } from "react";

    export type LazyComponentWrapper<T> = T & {
        $$vencordGetWrappedComponent(): T;
    };

    export function LazyComponent<T extends object = any>(
        factory: () => ComponentType<T>,
        attempts?: number
    ): LazyComponentWrapper<ComponentType<T>>;
}
