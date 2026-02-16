import {
    FigmaClient,
    FigmaNode,
    FigmaColor,
    FigmaPublishedStyle,
    figmaColorToCss,
} from "./figma-api.js";
import { resolveVariablesToTokens, ResolvedDesignTokens } from "./figma-variables.js";

// ─── Public Types ───────────────────────────────────────────

export interface DesignToken {
    name: string;
    cssVar: string;
    value: string;
}

export interface TypographyToken {
    name: string;
    cssClass: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: number;
    lineHeight: string;
    letterSpacing: string;
}

export interface ShadowToken {
    name: string;
    cssVar: string;
    value: string; // CSS box-shadow value
}

export interface DesignSystem {
    colors: DesignToken[];
    typography: TypographyToken[];
    spacing: DesignToken[];
    radii: DesignToken[];
    shadows: ShadowToken[];
    source: "variables" | "styles" | "mixed";
}

// ─── Extraction Orchestrator ────────────────────────────────

export async function extractDesignSystem(
    client: FigmaClient,
    fileKey: string,
): Promise<DesignSystem> {
    const system: DesignSystem = {
        colors: [],
        typography: [],
        spacing: [],
        radii: [],
        shadows: [],
        source: "styles",
    };

    // ── Source 1: Variables API (Enterprise) ──────────────────
    let variableTokens: ResolvedDesignTokens | null = null;
    try {
        const varsResponse = await client.getLocalVariables(fileKey);
        variableTokens = resolveVariablesToTokens(varsResponse);
        system.source = "variables";
    } catch {
        // Not available — continue with styles only
    }

    if (variableTokens) {
        for (const [cssVar, value] of Object.entries(variableTokens.colors)) {
            system.colors.push({ name: cssVarToName(cssVar), cssVar, value });
        }
        for (const [cssVar, value] of Object.entries(variableTokens.spacings)) {
            system.spacing.push({ name: cssVarToName(cssVar), cssVar, value });
        }
        for (const [cssVar, value] of Object.entries(variableTokens.radii)) {
            system.radii.push({ name: cssVarToName(cssVar), cssVar, value });
        }
        for (const [cssVar, value] of Object.entries(variableTokens.typography)) {
            // Variables API only gives font-size floats — we'll enrich with styles below
        }
    }

    // ── Source 2: Styles API (all plans) ─────────────────────
    try {
        const stylesResponse = await client.getFileStyles(fileKey);
        const publishedStyles = stylesResponse.meta?.styles ?? [];

        if (publishedStyles.length > 0) {
            if (system.source === "variables") system.source = "mixed";

            // Group by type
            const textStyles = publishedStyles.filter(s => s.style_type === "TEXT");
            const fillStyles = publishedStyles.filter(s => s.style_type === "FILL");
            const effectStyles = publishedStyles.filter(s => s.style_type === "EFFECT");

            // Collect all node IDs to fetch in one batch
            const allNodeIds = publishedStyles.map(s => s.node_id);

            if (allNodeIds.length > 0) {
                const nodesResponse = await client.getFileNodes(fileKey, allNodeIds);

                // Extract typography from TEXT style nodes
                for (const style of textStyles) {
                    const entry = nodesResponse.nodes[style.node_id];
                    if (!entry) continue;
                    const typo = extractTypographyFromNode(entry.document, style.name);
                    if (typo) system.typography.push(typo);
                }

                // Extract colors from FILL style nodes
                for (const style of fillStyles) {
                    const entry = nodesResponse.nodes[style.node_id];
                    if (!entry) continue;
                    const color = extractColorFromNode(entry.document, style.name);
                    if (color && !system.colors.some(c => c.cssVar === color.cssVar)) {
                        system.colors.push(color);
                    }
                }

                // Extract shadows from EFFECT style nodes
                for (const style of effectStyles) {
                    const entry = nodesResponse.nodes[style.node_id];
                    if (!entry) continue;
                    const shadow = extractShadowFromNode(entry.document, style.name);
                    if (shadow) system.shadows.push(shadow);
                }
            }
        }
    } catch {
        // Styles API failed — continue with whatever we have
    }

    // ── Source 3: File-tree fallback (scan text nodes) ────────
    if (system.typography.length === 0 || system.colors.length === 0) {
        try {
            const fileResponse = await client.getFile(fileKey, { depth: 3 });
            const scanned = scanFileTreeForTokens(fileResponse.document);

            if (system.typography.length === 0) {
                system.typography.push(...scanned.typography);
            }
            if (system.colors.length === 0) {
                for (const color of scanned.colors) {
                    if (!system.colors.some(c => c.value === color.value)) {
                        system.colors.push(color);
                    }
                }
            }
        } catch {
            // File tree scan failed — continue
        }
    }

    return system;
}

// ─── CSS Generation ─────────────────────────────────────────

export function designSystemToCSS(system: DesignSystem): string {
    const lines: string[] = [
        "/* ═══════════════════════════════════════════════════════ */",
        "/*  Figma Design System (auto-generated)                  */",
        "/*  Source: " + system.source.padEnd(44) + " */",
        "/* ═══════════════════════════════════════════════════════ */",
        "",
        ":root {",
    ];

    // Colors
    if (system.colors.length > 0) {
        lines.push("  /* Colors */");
        for (const token of system.colors) {
            lines.push(`  ${token.cssVar}: ${token.value};`);
        }
        lines.push("");
    }

    // Spacing
    if (system.spacing.length > 0) {
        lines.push("  /* Spacing */");
        for (const token of system.spacing) {
            lines.push(`  ${token.cssVar}: ${token.value};`);
        }
        lines.push("");
    }

    // Radii
    if (system.radii.length > 0) {
        lines.push("  /* Border Radii */");
        for (const token of system.radii) {
            lines.push(`  ${token.cssVar}: ${token.value};`);
        }
        lines.push("");
    }

    // Shadows
    if (system.shadows.length > 0) {
        lines.push("  /* Shadows */");
        for (const token of system.shadows) {
            lines.push(`  ${token.cssVar}: ${token.value};`);
        }
        lines.push("");
    }

    lines.push("}");
    lines.push("");

    // Typography classes
    if (system.typography.length > 0) {
        lines.push("/* ─── Typography ─────────────────────────────────── */");
        lines.push("");
        for (const typo of system.typography) {
            lines.push(`.${typo.cssClass} {`);
            lines.push(`  font-family: ${typo.fontFamily};`);
            lines.push(`  font-size: ${typo.fontSize};`);
            lines.push(`  font-weight: ${typo.fontWeight};`);
            lines.push(`  line-height: ${typo.lineHeight};`);
            if (typo.letterSpacing !== "normal") {
                lines.push(`  letter-spacing: ${typo.letterSpacing};`);
            }
            lines.push("}");
            lines.push("");
        }
    }

    return lines.join("\n");
}

export function designSystemToSCSS(system: DesignSystem): string {
    const lines: string[] = [
        "// ═══════════════════════════════════════════════════════",
        "//  Figma Design System (auto-generated)",
        `//  Source: ${system.source}`,
        "// ═══════════════════════════════════════════════════════",
        "",
    ];

    // SCSS variables
    if (system.colors.length > 0) {
        lines.push("// Colors");
        for (const token of system.colors) {
            lines.push(`$${token.name}: ${token.value};`);
        }
        lines.push("");
    }

    if (system.spacing.length > 0) {
        lines.push("// Spacing");
        for (const token of system.spacing) {
            lines.push(`$${token.name}: ${token.value};`);
        }
        lines.push("");
    }

    if (system.radii.length > 0) {
        lines.push("// Border Radii");
        for (const token of system.radii) {
            lines.push(`$${token.name}: ${token.value};`);
        }
        lines.push("");
    }

    // CSS custom properties for runtime usage
    lines.push(":root {");
    for (const token of [...system.colors, ...system.spacing, ...system.radii]) {
        lines.push(`  ${token.cssVar}: ${token.value};`);
    }
    for (const token of system.shadows) {
        lines.push(`  ${token.cssVar}: ${token.value};`);
    }
    lines.push("}");
    lines.push("");

    // Typography mixins
    if (system.typography.length > 0) {
        lines.push("// ─── Typography Mixins ──────────────────────────");
        lines.push("");
        for (const typo of system.typography) {
            lines.push(`@mixin ${typo.cssClass} {`);
            lines.push(`  font-family: ${typo.fontFamily};`);
            lines.push(`  font-size: ${typo.fontSize};`);
            lines.push(`  font-weight: ${typo.fontWeight};`);
            lines.push(`  line-height: ${typo.lineHeight};`);
            if (typo.letterSpacing !== "normal") {
                lines.push(`  letter-spacing: ${typo.letterSpacing};`);
            }
            lines.push("}");
            lines.push("");
        }

        // Also generate utility classes
        lines.push("// ─── Typography Classes ─────────────────────────");
        lines.push("");
        for (const typo of system.typography) {
            lines.push(`.${typo.cssClass} {`);
            lines.push(`  @include ${typo.cssClass};`);
            lines.push("}");
            lines.push("");
        }
    }

    return lines.join("\n");
}

// ─── Node Extraction Helpers ────────────────────────────────

function extractTypographyFromNode(node: FigmaNode, styleName: string): TypographyToken | null {
    // Navigate to find the TEXT node (the style node itself or a child)
    const textNode = findFirstTextNode(node);
    if (!textNode?.style) return null;

    const s = textNode.style;
    const fontFamily = s.fontFamily ? `'${s.fontFamily}', sans-serif` : "'Inter', sans-serif";
    const fontSize = s.fontSize ? `${s.fontSize}px` : "16px";
    const fontWeight = s.fontWeight ?? 400;
    const lineHeight = s.lineHeightPx && s.fontSize
        ? (s.lineHeightPx / s.fontSize).toFixed(2)
        : "1.5";
    const letterSpacing = s.letterSpacing
        ? s.letterSpacing === 0 ? "normal" : `${(s.letterSpacing / (s.fontSize || 16)).toFixed(3)}em`
        : "normal";

    return {
        name: styleName,
        cssClass: `text-${nameToKebab(styleName)}`,
        fontFamily,
        fontSize,
        fontWeight,
        lineHeight,
        letterSpacing,
    };
}

function extractColorFromNode(node: FigmaNode, styleName: string): DesignToken | null {
    const fill = node.fills?.find(f => f.visible !== false && f.type === "SOLID" && f.color);
    if (!fill?.color) return null;

    const value = figmaColorToCss(fill.color, fill.opacity ?? 1);
    if (!value) return null;

    const kebab = nameToKebab(styleName);
    return {
        name: kebab,
        cssVar: `--${kebab}`,
        value,
    };
}

function extractShadowFromNode(node: FigmaNode, styleName: string): ShadowToken | null {
    const shadow = node.effects?.find(
        e => (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") && e.visible !== false
    );
    if (!shadow) return null;

    const color = shadow.color ? figmaColorToCss(shadow.color) : "rgba(0,0,0,0.25)";
    const x = shadow.offset?.x ?? 0;
    const y = shadow.offset?.y ?? 4;
    const blur = shadow.radius ?? 8;
    const spread = shadow.spread ?? 0;
    const inset = shadow.type === "INNER_SHADOW" ? "inset " : "";
    const value = `${inset}${x}px ${y}px ${blur}px ${spread}px ${color}`;

    const kebab = nameToKebab(styleName);
    return {
        name: kebab,
        cssVar: `--shadow-${kebab}`,
        value,
    };
}

// ─── File Tree Scanner (fallback) ───────────────────────────

interface ScannedTokens {
    colors: DesignToken[];
    typography: TypographyToken[];
}

function scanFileTreeForTokens(root: FigmaNode): ScannedTokens {
    const seenColors = new Map<string, DesignToken>();
    const seenTypo = new Map<string, TypographyToken>();
    let colorIndex = 1;
    let typoIndex = 1;

    const stack: FigmaNode[] = [root];
    while (stack.length > 0) {
        const node = stack.pop()!;

        // Collect unique colors from fills
        if (node.fills) {
            for (const fill of node.fills) {
                if (fill.visible !== false && fill.type === "SOLID" && fill.color) {
                    const css = figmaColorToCss(fill.color, fill.opacity ?? 1);
                    if (css && !seenColors.has(css)) {
                        const name = `color-${colorIndex++}`;
                        seenColors.set(css, { name, cssVar: `--${name}`, value: css });
                    }
                }
            }
        }

        // Collect unique typography from text nodes
        if (node.type === "TEXT" && node.style?.fontFamily && node.style.fontSize) {
            const key = `${node.style.fontFamily}-${node.style.fontSize}-${node.style.fontWeight ?? 400}`;
            if (!seenTypo.has(key)) {
                const s = node.style;
                const fontFamily = `'${s.fontFamily}', sans-serif`;
                const fontSize = `${s.fontSize}px`;
                const fontWeight = s.fontWeight ?? 400;
                const lineHeight = s.lineHeightPx && s.fontSize
                    ? (s.lineHeightPx / s.fontSize).toFixed(2)
                    : "1.5";
                const letterSpacing = s.letterSpacing
                    ? s.letterSpacing === 0 ? "normal" : `${(s.letterSpacing / (s.fontSize || 16)).toFixed(3)}em`
                    : "normal";

                seenTypo.set(key, {
                    name: `Text Style ${typoIndex}`,
                    cssClass: `text-style-${typoIndex}`,
                    fontFamily,
                    fontSize,
                    fontWeight,
                    lineHeight,
                    letterSpacing,
                });
                typoIndex++;
            }
        }

        if (node.children) {
            for (let i = node.children.length - 1; i >= 0; i--) {
                stack.push(node.children[i]);
            }
        }
    }

    return {
        colors: [...seenColors.values()],
        typography: [...seenTypo.values()],
    };
}

// ─── Utility ────────────────────────────────────────────────

function findFirstTextNode(node: FigmaNode): FigmaNode | null {
    if (node.type === "TEXT") return node;
    if (node.children) {
        for (const child of node.children) {
            const found = findFirstTextNode(child);
            if (found) return found;
        }
    }
    return null;
}

function nameToKebab(name: string): string {
    return name
        .replace(/\//g, "-")
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9-]/g, "")
        .replace(/-+/g, "-")
        .toLowerCase();
}

function cssVarToName(cssVar: string): string {
    return cssVar.replace(/^--/, "");
}
