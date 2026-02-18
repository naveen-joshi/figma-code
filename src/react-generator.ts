import path from "node:path";
import { promises as fs } from "node:fs";

import { NormalizedNode, NormalizedScreen, StyleValue } from "./types.js";
import { escapeHtml, toClassName, toKebabCase, toPascalCase } from "./utils.js";
import { buildTokenResolver, TokenResolver } from "./design-tokens.js";
import {
    buildNodeSignature,
    extractSharedComponents,
    SharedComponentDefinition,
} from "./shared-components.js";
import { buildPreviewReport } from "./preview-report.js";

// ─── Types ──────────────────────────────────────────────────

interface GenerateReactOptions {
    outputRoot: string;
}

interface GeneratedReactFiles {
    componentName: string;
    componentDir: string;
    tsxPath: string;
    cssPath: string;
    tokenPath: string;
    previewReportPath: string;
    sharedComponents: Array<{
        componentName: string;
        componentDir: string;
        tsxPath: string;
        cssPath: string;
        occurrences: number;
    }>;
}

interface RenderOptions {
    sharedBySignature?: Map<string, SharedComponentDefinition>;
    disableSharedReplacement?: boolean;
}

// ─── CSS token mapping (reuses existing TokenResolver) ──────

function mapColorToken(tokenResolver: TokenResolver, value: string): string {
    const token = tokenResolver.colorVarByValue.get(value);
    return token ? `var(--${token})` : value;
}

function mapFontSizeToken(tokenResolver: TokenResolver, value: number): string {
    const token = tokenResolver.fontSizeVarByValue.get(value);
    return token ? `var(--${token})` : `${value}px`;
}

function mapFontWeightToken(tokenResolver: TokenResolver, value: number): string {
    const token = tokenResolver.fontWeightVarByValue.get(value);
    return token ? `var(--${token})` : String(value);
}

function mapSpacingToken(tokenResolver: TokenResolver, value: number): string {
    const token = tokenResolver.spacingVarByValue.get(value);
    return token ? `var(--${token})` : `${value}px`;
}

// ─── CSS from style ─────────────────────────────────────────

function cssFromStyle(style: StyleValue, tokenResolver: TokenResolver): string[] {
    const lines: string[] = [];

    if (style.backgroundColor) {
        lines.push(`background: ${mapColorToken(tokenResolver, style.backgroundColor)};`);
    }
    if (style.textColor) {
        lines.push(`color: ${mapColorToken(tokenResolver, style.textColor)};`);
    }
    if (style.fontSizePx) {
        lines.push(`font-size: ${mapFontSizeToken(tokenResolver, style.fontSizePx)};`);
    }
    if (style.fontWeight) {
        lines.push(`font-weight: ${mapFontWeightToken(tokenResolver, style.fontWeight)};`);
    }
    if (style.widthPx) {
        lines.push(`width: ${style.widthPx}px;`);
    }
    if (style.heightPx) {
        lines.push(`height: ${style.heightPx}px;`);
    }
    if (style.paddingPx !== undefined) {
        lines.push(`padding: ${mapSpacingToken(tokenResolver, style.paddingPx)};`);
    }
    if (style.gapPx !== undefined) {
        lines.push(`gap: ${mapSpacingToken(tokenResolver, style.gapPx)};`);
    }

    return lines;
}

// ─── CSS class name helper (camelCase for CSS Modules) ──────

function toCssModuleKey(name: string): string {
    const kebab = toClassName(name);
    return kebab.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

// ─── JSX Rendering ──────────────────────────────────────────

function renderNodeJsx(node: NormalizedNode, options: RenderOptions): string {
    if (!options.disableSharedReplacement) {
        const signature = buildNodeSignature(node);
        const sharedComponent = options.sharedBySignature?.get(signature);
        if (sharedComponent) {
            const compName = toPascalCase(sharedComponent.componentName);
            return `<${compName} />`;
        }
    }

    const cssKey = toCssModuleKey(node.name);

    if (node.kind === "text") {
        return `<p className={styles.${cssKey}}>${escapeHtml(node.textContent ?? "")}</p>`;
    }

    if (node.kind === "image") {
        const className = toClassName(node.name);
        return `<img className={styles.${cssKey}} src={\`\${process.env.PUBLIC_URL}/assets/${className}.svg\`} alt="${escapeHtml(node.name)}" />`;
    }

    if (node.kind === "button") {
        const label = node.children.find((child) => child.kind === "text")?.textContent || node.name;
        return `<button className={styles.${cssKey}}>${escapeHtml(label)}</button>`;
    }

    const childrenJsx = node.children.map((child) => renderNodeJsx(child, options)).join("\n");
    return `<div className={styles.${cssKey}}>\n${indent(childrenJsx)}\n</div>`;
}

// ─── CSS Module Rendering ───────────────────────────────────

function renderNodeCss(node: NormalizedNode, visited: Set<string>, tokenResolver: TokenResolver): string {
    const className = toClassName(node.name);
    if (visited.has(className)) {
        return "";
    }
    visited.add(className);

    const cssLines = cssFromStyle(node.style, tokenResolver);

    if (node.layout === "row") {
        cssLines.push("display: flex;");
        cssLines.push("flex-direction: row;");
        cssLines.push("align-items: center;");
    } else if (node.layout === "column") {
        cssLines.push("display: flex;");
        cssLines.push("flex-direction: column;");
    }

    if (node.kind === "button") {
        cssLines.push("border: none;");
        cssLines.push("cursor: pointer;");
    }

    if (node.kind === "image") {
        cssLines.push("max-width: 100%;");
        cssLines.push("display: block;");
    }

    // Use camelCase class names for CSS Modules
    const cssKey = toCssModuleKey(node.name);
    const currentBlock = `.${cssKey} {\n${indent(cssLines.join("\n"))}\n}`;
    const childBlocks = node.children
        .map((child) => renderNodeCss(child, visited, tokenResolver))
        .filter((block) => block.length > 0)
        .join("\n\n");

    return childBlocks.length > 0 ? `${currentBlock}\n\n${childBlocks}` : currentBlock;
}

// ─── Token file (CSS custom properties) ─────────────────────

function buildTokensCss(tokenResolver: TokenResolver): string {
    const lines: string[] = [":root {"];

    for (const [value, name] of tokenResolver.colorVarByValue) {
        lines.push(`  --${name}: ${value};`);
    }
    for (const [value, name] of tokenResolver.fontSizeVarByValue) {
        lines.push(`  --${name}: ${value}px;`);
    }
    for (const [value, name] of tokenResolver.fontWeightVarByValue) {
        lines.push(`  --${name}: ${value};`);
    }
    for (const [value, name] of tokenResolver.spacingVarByValue) {
        lines.push(`  --${name}: ${value}px;`);
    }

    lines.push("}");
    return lines.join("\n");
}

// ─── Component TSX builder ──────────────────────────────────

function buildComponentTsx(
    componentName: string,
    cssModulePath: string,
    jsxContent: string,
    sharedImports: Array<{ componentName: string; importPath: string }> = [],
): string {
    const className = toPascalCase(componentName);
    const lines: string[] = [
        `import React from 'react';`,
        `import styles from './${cssModulePath}';`,
    ];

    for (const imp of sharedImports) {
        lines.push(`import ${toPascalCase(imp.componentName)} from '${imp.importPath}';`);
    }

    lines.push("");
    lines.push(`export default function ${className}() {`);
    lines.push(`  return (`);
    lines.push(`${indent(indent(jsxContent))}`);
    lines.push(`  );`);
    lines.push(`}`);

    return lines.join("\n");
}

// ─── Helpers ────────────────────────────────────────────────

function indent(text: string, count = 2): string {
    const pad = " ".repeat(count);
    return text
        .split("\n")
        .map((line) => (line.length > 0 ? `${pad}${line}` : line))
        .join("\n");
}

async function ensureDir(targetDir: string): Promise<void> {
    await fs.mkdir(targetDir, { recursive: true });
}

// ─── Main Export ────────────────────────────────────────────

export async function generateReactScreen(
    screen: NormalizedScreen,
    options: GenerateReactOptions,
): Promise<GeneratedReactFiles> {
    const componentName = toKebabCase(screen.name);
    const pascalName = toPascalCase(componentName);
    const componentDir = path.join(options.outputRoot, "src", "components", "pages", componentName);
    const sharedComponentRootDir = path.join(options.outputRoot, "src", "components", "generated");
    const stylesDir = path.join(options.outputRoot, "src", "styles");

    await ensureDir(componentDir);
    await ensureDir(sharedComponentRootDir);
    await ensureDir(stylesDir);

    // Extract shared components
    const sharedDefinitions = extractSharedComponents(screen.root);
    const sharedBySignature = new Map(sharedDefinitions.map((def) => [def.signature, def]));

    // Build design tokens
    const tokenResult = buildTokenResolver([screen.root, ...sharedDefinitions.map((entry) => entry.rootNode)]);
    const tokenPath = path.join(stylesDir, "figma-tokens.css");
    await fs.writeFile(tokenPath, buildTokensCss(tokenResult.resolver), "utf8");

    // Generate shared components
    const sharedComponents = await Promise.all(
        sharedDefinitions.map(async (definition) => {
            const sharedDir = path.join(sharedComponentRootDir, definition.componentName);
            await ensureDir(sharedDir);

            const jsx = renderNodeJsx(definition.rootNode, { disableSharedReplacement: true });
            const css = renderNodeCss(definition.rootNode, new Set<string>(), tokenResult.resolver);
            const cssFileName = `${pascalName}.module.css`;
            const tsx = buildComponentTsx(definition.componentName, cssFileName, jsx);

            const tsxPath = path.join(sharedDir, `${toPascalCase(definition.componentName)}.tsx`);
            const cssPath = path.join(sharedDir, `${toPascalCase(definition.componentName)}.module.css`);

            await Promise.all([
                fs.writeFile(tsxPath, tsx, "utf8"),
                fs.writeFile(cssPath, css, "utf8"),
            ]);

            return {
                componentName: definition.componentName,
                componentDir: sharedDir,
                tsxPath,
                cssPath,
                occurrences: definition.occurrences,
            };
        }),
    );

    // Generate main component
    const jsx = renderNodeJsx(screen.root, { sharedBySignature });
    const css = renderNodeCss(screen.root, new Set<string>(), tokenResult.resolver);
    const cssFileName = `${pascalName}.module.css`;
    const tsx = buildComponentTsx(
        componentName,
        cssFileName,
        jsx,
        sharedDefinitions.map((def) => ({
            componentName: def.componentName,
            importPath: `../../generated/${def.componentName}/${toPascalCase(def.componentName)}`,
        })),
    );

    const tsxPath = path.join(componentDir, `${pascalName}.tsx`);
    const cssPath = path.join(componentDir, `${pascalName}.module.css`);

    await Promise.all([
        fs.writeFile(tsxPath, tsx, "utf8"),
        fs.writeFile(cssPath, css, "utf8"),
    ]);

    // Preview report
    const previewReportPath = path.join(componentDir, `${componentName}.preview.json`);
    const previewReport = buildPreviewReport({
        screenName: screen.name,
        screenId: screen.id,
        componentName,
        pageDir: componentDir,
        tokenFile: tokenPath,
        previewFile: previewReportPath,
        rootNode: screen.root,
        tokenResolver: tokenResult.resolver,
        sharedDefinitions,
    });
    await fs.writeFile(previewReportPath, `${JSON.stringify(previewReport, null, 2)}\n`, "utf8");

    return {
        componentName,
        componentDir,
        tsxPath,
        cssPath,
        tokenPath,
        previewReportPath,
        sharedComponents,
    };
}
