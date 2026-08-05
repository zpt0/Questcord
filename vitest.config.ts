import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js", ".jsx"],
        alias: {
            "@api": path.resolve(__dirname, "."),
            "@utils": path.resolve(__dirname, "."),
            "@webpack": path.resolve(__dirname, "."),
            "@webpack/common": path.resolve(__dirname, "."),
        },
    },
});
