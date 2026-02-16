import { NormalizedNode } from "./types.js";

interface TokenCollections {
  colors: string[];
  fontSizes: number[];
  fontWeights: number[];
  spacings: number[];
}

export interface TokenResolver {
  colorVarByValue: Map<string, string>;
  fontSizeVarByValue: Map<number, string>;
  fontWeightVarByValue: Map<number, string>;
  spacingVarByValue: Map<number, string>;
}

function walk(node: NormalizedNode, visitor: (current: NormalizedNode) => void): void {
  visitor(node);
  node.children.forEach((child) => walk(child, visitor));
}

function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function collectTokens(rootNodes: NormalizedNode[]): TokenCollections {
  const colors: string[] = [];
  const fontSizes: number[] = [];
  const fontWeights: number[] = [];
  const spacings: number[] = [];

  rootNodes.forEach((root) => {
    walk(root, (current) => {
      if (current.style.backgroundColor) {
        colors.push(current.style.backgroundColor);
      }

      if (current.style.textColor) {
        colors.push(current.style.textColor);
      }

      if (current.style.fontSizePx !== undefined) {
        fontSizes.push(current.style.fontSizePx);
      }

      if (current.style.fontWeight !== undefined) {
        fontWeights.push(current.style.fontWeight);
      }

      if (current.style.paddingPx !== undefined) {
        spacings.push(current.style.paddingPx);
      }

      if (current.style.gapPx !== undefined) {
        spacings.push(current.style.gapPx);
      }
    });
  });

  return {
    colors: uniqueStrings(colors),
    fontSizes: uniqueSortedNumbers(fontSizes),
    fontWeights: uniqueSortedNumbers(fontWeights),
    spacings: uniqueSortedNumbers(spacings),
  };
}

export function buildTokenResolver(rootNodes: NormalizedNode[]): {
  resolver: TokenResolver;
  scssContent: string;
} {
  const collected = collectTokens(rootNodes);

  const colorVarByValue = new Map<string, string>();
  const fontSizeVarByValue = new Map<number, string>();
  const fontWeightVarByValue = new Map<number, string>();
  const spacingVarByValue = new Map<number, string>();

  const scssLines: string[] = ["// Generated from Figma design tokens", ""];

  collected.colors.forEach((value, index) => {
    const varName = `figma-color-${index + 1}`;
    colorVarByValue.set(value, varName);
    scssLines.push(`$${varName}: ${value};`);
  });

  if (collected.colors.length > 0) {
    scssLines.push("");
  }

  collected.fontSizes.forEach((value, index) => {
    const varName = `figma-font-size-${index + 1}`;
    fontSizeVarByValue.set(value, varName);
    scssLines.push(`$${varName}: ${value}px;`);
  });

  if (collected.fontSizes.length > 0) {
    scssLines.push("");
  }

  collected.fontWeights.forEach((value, index) => {
    const varName = `figma-font-weight-${index + 1}`;
    fontWeightVarByValue.set(value, varName);
    scssLines.push(`$${varName}: ${value};`);
  });

  if (collected.fontWeights.length > 0) {
    scssLines.push("");
  }

  collected.spacings.forEach((value, index) => {
    const varName = `figma-spacing-${index + 1}`;
    spacingVarByValue.set(value, varName);
    scssLines.push(`$${varName}: ${value}px;`);
  });

  return {
    resolver: {
      colorVarByValue,
      fontSizeVarByValue,
      fontWeightVarByValue,
      spacingVarByValue,
    },
    scssContent: `${scssLines.join("\n")}\n`,
  };
}
