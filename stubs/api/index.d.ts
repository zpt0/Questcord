declare module "@api/index" {
    export const DataStore: {
        get<T = any>(key: string): Promise<T | undefined>;
        set(key: string, value: any): Promise<void>;
        del(key: string): Promise<void>;
        delete(key: string): Promise<void>;
        keys(category?: string): Promise<string[]>;
        entries(category?: string): Promise<[string, any][]>;
    };
}
