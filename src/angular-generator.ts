import path from "node:path";
import { promises as fs } from "node:fs";

import { NormalizedNode, NormalizedScreen, StyleValue } from "./types.js";
import { escapeHtml, toClassName, toKebabCase } from "./utils.js";
import { buildTokenResolver, TokenResolver } from "./design-tokens.js";
import {
  buildNodeSignature,
  extractSharedComponents,
  SharedComponentDefinition,
} from "./shared-components.js";
import { buildPreviewReport } from "./preview-report.js";

interface GenerateAngularOptions {
  outputRoot: string;
}

interface GeneratedFiles {
  componentName: string;
  componentDir: string;
  htmlPath: string;
  scssPath: string;
  tsPath: string;
  tokenPath: string;
  previewReportPath: string;
  sharedComponents: Array<{
    componentName: string;
    componentDir: string;
    htmlPath: string;
    scssPath: string;
    tsPath: string;
    occurrences: number;
  }>;
}

interface RenderOptions {
  sharedBySignature?: Map<string, SharedComponentDefinition>;
  disableSharedReplacement?: boolean;
}

function mapColorToken(tokenResolver: TokenResolver, value: string): string {
  const token = tokenResolver.colorVarByValue.get(value);
  return token ? `tokens.$${token}` : value;
}

function mapFontSizeToken(tokenResolver: TokenResolver, value: number): string {
  const token = tokenResolver.fontSizeVarByValue.get(value);
  return token ? `tokens.$${token}` : `${value}px`;
}

function mapFontWeightToken(tokenResolver: TokenResolver, value: number): string {
  const token = tokenResolver.fontWeightVarByValue.get(value);
  return token ? `tokens.$${token}` : String(value);
}

function mapSpacingToken(tokenResolver: TokenResolver, value: number): string {
  const token = tokenResolver.spacingVarByValue.get(value);
  return token ? `tokens.$${token}` : `${value}px`;
}

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

function renderNodeHtml(node: NormalizedNode, options: RenderOptions): string {
  if (!options.disableSharedReplacement) {
    const signature = buildNodeSignature(node);
    const sharedComponent = options.sharedBySignature?.get(signature);
    if (sharedComponent) {
      return `<${sharedComponent.selector}></${sharedComponent.selector}>`;
    }
  }

  const className = toClassName(node.name);

  if (node.kind === "text") {
    return `<p class="${className}">${escapeHtml(node.textContent ?? "")}</p>`;
  }

  if (node.kind === "image") {
    return `<img class="${className}" src="assets/${className}.svg" alt="${escapeHtml(node.name)}" />`;
  }

  if (node.kind === "button") {
    const label = node.children.find((child) => child.kind === "text")?.textContent || node.name;
    return `<button class="${className}">${escapeHtml(label)}</button>`;
  }

  const childrenHtml = node.children.map((child) => renderNodeHtml(child, options)).join("\n");
  return `<div class="${className}">\n${indent(childrenHtml)}\n</div>`;
}

function renderNodeScss(node: NormalizedNode, visited: Set<string>, tokenResolver: TokenResolver): string {
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

  const currentBlock = `.${className} {\n${indent(cssLines.join("\n"))}\n}`;
  const childBlocks = node.children
    .map((child) => renderNodeScss(child, visited, tokenResolver))
    .filter((block) => block.length > 0)
    .join("\n\n");

  return childBlocks.length > 0 ? `${currentBlock}\n\n${childBlocks}` : currentBlock;
}

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

function toPascalCase(value: string): string {
  return value
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
}

function buildComponentTs(
  componentName: string,
  sharedImports: Array<{ className: string; importPath: string }> = [],
): string {
  const importLines = ["import { Component } from '@angular/core';"];

  sharedImports.forEach((entry) => {
    importLines.push(`import { ${entry.className} } from '${entry.importPath}';`);
  });

  const importsBlock =
    sharedImports.length > 0 ? `,\n  imports: [${sharedImports.map((entry) => entry.className).join(", ")}]` : "";

  return `${importLines.join("\n")}\n\n@Component({\n  selector: 'app-${componentName}',\n  standalone: true,\n  templateUrl: './${componentName}.component.html',\n  styleUrl: './${componentName}.component.scss'${importsBlock},\n})\nexport class ${toPascalCase(componentName)}Component {}`;
}

function styleHeaderWithTokens(tokenPath: string): string {
  return `@use "${tokenPath}" as tokens;\n\n:host {\n  display: block;\n}\n\n`;
}

export async function generateAngularScreen(
  screen: NormalizedScreen,
  options: GenerateAngularOptions,
): Promise<GeneratedFiles> {
  const componentName = toKebabCase(screen.name);
  const componentDir = path.join(options.outputRoot, "src", "app", "pages", componentName);
  const sharedComponentRootDir = path.join(options.outputRoot, "src", "app", "components", "generated");
  const stylesDir = path.join(options.outputRoot, "src", "styles");

  await ensureDir(componentDir);
  await ensureDir(sharedComponentRootDir);
  await ensureDir(stylesDir);

  const sharedDefinitions = extractSharedComponents(screen.root);
  const sharedBySignature = new Map(sharedDefinitions.map((definition) => [definition.signature, definition]));

  const tokenResult = buildTokenResolver([screen.root, ...sharedDefinitions.map((entry) => entry.rootNode)]);
  const tokenPath = path.join(stylesDir, "_figma-tokens.scss");
  await fs.writeFile(tokenPath, tokenResult.scssContent, "utf8");

  const sharedComponents = await Promise.all(
    sharedDefinitions.map(async (definition) => {
      const sharedComponentDir = path.join(sharedComponentRootDir, definition.componentName);
      await ensureDir(sharedComponentDir);

      const html = renderNodeHtml(definition.rootNode, {
        disableSharedReplacement: true,
      });

      const scss = `${styleHeaderWithTokens("../../../../styles/figma-tokens")}${renderNodeScss(definition.rootNode, new Set<string>(), tokenResult.resolver)}`;
      const ts = buildComponentTs(definition.componentName);

      const htmlPath = path.join(sharedComponentDir, `${definition.componentName}.component.html`);
      const scssPath = path.join(sharedComponentDir, `${definition.componentName}.component.scss`);
      const tsPath = path.join(sharedComponentDir, `${definition.componentName}.component.ts`);

      await Promise.all([
        fs.writeFile(htmlPath, html, "utf8"),
        fs.writeFile(scssPath, scss, "utf8"),
        fs.writeFile(tsPath, ts, "utf8"),
      ]);

      return {
        componentName: definition.componentName,
        componentDir: sharedComponentDir,
        htmlPath,
        scssPath,
        tsPath,
        occurrences: definition.occurrences,
      };
    }),
  );

  const html = renderNodeHtml(screen.root, {
    sharedBySignature,
  });

  const scssBody = renderNodeScss(screen.root, new Set<string>(), tokenResult.resolver);
  const scssHeader = styleHeaderWithTokens("../../../styles/figma-tokens");
  const scss = `${scssHeader}${scssBody}`;

  const ts = buildComponentTs(
    componentName,
    sharedDefinitions.map((definition) => ({
      className: `${toPascalCase(definition.componentName)}Component`,
      importPath: `../../components/generated/${definition.componentName}/${definition.componentName}.component`,
    })),
  );

  const htmlPath = path.join(componentDir, `${componentName}.component.html`);
  const scssPath = path.join(componentDir, `${componentName}.component.scss`);
  const tsPath = path.join(componentDir, `${componentName}.component.ts`);

  await Promise.all([
    fs.writeFile(htmlPath, html, "utf8"),
    fs.writeFile(scssPath, scss, "utf8"),
    fs.writeFile(tsPath, ts, "utf8"),
  ]);

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
    htmlPath,
    scssPath,
    tsPath,
    tokenPath,
    previewReportPath,
    sharedComponents,
  };
}
