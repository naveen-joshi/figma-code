import type { FigmaColor, FigmaVariable, FigmaVariableCollection, FigmaVariablesResponse } from "./figma-api.js";
import { figmaColorToCss } from "./figma-api.js";

// ─── Public Interface ─────────────────────────────────────────

export interface ResolvedDesignTokens {
    colors: Record<string, string>;     // --color-primary: #xxx
    spacings: Record<string, string>;   // --spacing-sm: 8px
    radii: Record<string, string>;      // --radius-md: 8px
    typography: Record<string, string>; // --font-size-md: 16px
    raw: FigmaVariable[];               // original variables for debugging
}

// ─── Main Function ────────────────────────────────────────────

/**
 * Converts Figma Variables API response into CSS custom properties.
 * Groups by variable collection and resolves default mode values.
 */
export function resolveVariablesToTokens(data: FigmaVariablesResponse): ResolvedDesignTokens {
    const { variables, variableCollections } = data.meta;

    const colors: Record<string, string> = {};
    const spacings: Record<string, string> = {};
    const radii: Record<string, string> = {};
    const typography: Record<string, string> = {};
    const raw: FigmaVariable[] = [];

    for (const variable of Object.values(variables)) {
        if (variable.remote) continue; // skip remote references

        raw.push(variable);

        const collection = variableCollections[variable.variableCollectionId];
        if (!collection) continue;

        const defaultModeId = collection.defaultModeId;
        const value = variable.valuesByMode[defaultModeId];
        if (value == null) continue;

        const tokenName = variableNameToToken(variable.name);

        switch (variable.resolvedType) {
            case "COLOR": {
                const cssColor = figmaColorToCss(value as FigmaColor);
                if (cssColor) {
                    colors[`--${tokenName}`] = cssColor;
                }
                break;
            }

            case "FLOAT": {
                const num = value as number;
                const category = categorizeFloat(variable.name, variable.scopes);

                if (category === "spacing") {
                    spacings[`--${tokenName}`] = `${num}px`;
                } else if (category === "radius") {
                    radii[`--${tokenName}`] = `${num}px`;
                } else if (category === "font-size") {
                    typography[`--${tokenName}`] = `${num}px`;
                }
                break;
            }

            // STRING and BOOLEAN variables are not typical design tokens
            default:
                break;
        }
    }

    return { colors, spacings, radii, typography, raw };
}

/**
 * Generates a SCSS file from resolved design tokens.
 */
export function tokensToScss(tokens: ResolvedDesignTokens): string {
    const lines: string[] = [
        "// ─── Figma Design Tokens (auto-generated from Variables API) ───",
        ":root {",
    ];

    const sections: [string, Record<string, string>][] = [
        ["Colors", tokens.colors],
        ["Spacing", tokens.spacings],
        ["Radii", tokens.radii],
        ["Typography", tokens.typography],
    ];

    for (const [label, map] of sections) {
        const entries = Object.entries(map);
        if (entries.length === 0) continue;

        lines.push(`  // ${label}`);
        for (const [prop, val] of entries) {
            lines.push(`  ${prop}: ${val};`);
        }
        lines.push("");
    }

    lines.push("}");
    return lines.join("\n");
}

// ─── Helpers ──────────────────────────────────────────────────

function variableNameToToken(name: string): string {
    // Figma variable names use "/" as separators: "color/primary" → "color-primary"
    return name
        .replace(/\//g, "-")
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9-]/g, "")
        .toLowerCase();
}

function categorizeFloat(name: string, scopes: string[]): "spacing" | "radius" | "font-size" | "unknown" {
    const lowerName = name.toLowerCase();
    const scopeStr = scopes.join(" ").toLowerCase();

    if (scopeStr.includes("corner_radius") || lowerName.includes("radius") || lowerName.includes("corner")) {
        return "radius";
    }
    if (scopeStr.includes("gap") || scopeStr.includes("width") || scopeStr.includes("height") ||
        lowerName.includes("spacing") || lowerName.includes("padding") || lowerName.includes("gap") ||
        lowerName.includes("margin")) {
        return "spacing";
    }
    if (scopeStr.includes("font_size") || lowerName.includes("font") || lowerName.includes("text-size")) {
        return "font-size";
    }

    return "unknown";
}
