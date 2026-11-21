import { afterEach, describe, expect, it } from "vitest";

import { settings } from "../settings";
import { applyPillContainerStyle } from "../ui/pillStyles";

interface FakeElement {
    classes: Set<string>;
    vars: Record<string, string>;
    dataset: Record<string, string>;
}

function fakeElement(): FakeElement & HTMLElement {
    const classes = new Set<string>();
    const vars: Record<string, string> = {};
    const dataset: Record<string, string> = {};

    return {
        classes,
        vars,
        dataset,
        classList: {
            add: (value: string) => classes.add(value),
            remove: (...values: string[]) => values.forEach((value) => classes.delete(value)),
            contains: (value: string) => classes.has(value),
        },
        style: {
            setProperty: (key: string, value: string) => {
                vars[key] = value;
            },
        },
    } as unknown as FakeElement & HTMLElement;
}

afterEach(() => {
    const store = settings.store as any;
    delete store.pillStyle;
    delete store.pillMaxWidth;
});

describe("Questcord pill container styles", () => {
    it("uses the Clonecord defaults when no overrides are stored", () => {
        const element = fakeElement();
        applyPillContainerStyle(element);

        expect(element.dataset.style).toBe("glass");
        expect(element.classList.contains("qc-pos-top-center")).toBe(true);
        expect(element.vars["--qc-max-width"]).toBe("400px");
        expect(element.vars["--qc-radius"]).toBe("10px");
        expect(element.vars["--qc-font-size"]).toBe("13px");
        expect(element.vars["--qc-padding"]).toBe("10px");
    });

    it("applies style variants and the configured max width", () => {
        const store = settings.store as any;
        store.pillStyle = "minimal";
        store.pillMaxWidth = 600;

        const element = fakeElement();
        applyPillContainerStyle(element);

        expect(element.dataset.style).toBe("minimal");
        expect(element.vars["--qc-max-width"]).toBe("600px");
    });
});
