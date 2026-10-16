import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        ignores: [
            "dist/",
            "node_modules/",
            "index.js",
            "constants.js",
            "constants.test.js",
            "settings.js",
            "core/*.js",
            "quests/*.js",
            "ui/*.js",
            "components/*.js",
        ],
    },
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "off",

            "@typescript-eslint/no-unused-vars": "warn",

            "no-empty": ["error", { allowEmptyCatch: true }],

            "@typescript-eslint/no-require-imports": "off",

            "no-ex-assign": "off",

            "prefer-const": "off",

            "preserve-caught-error": "off",
        },
    }
);
