import { clampNumber } from "./utils.js";
import { FigmaNode, figmaColorToCss } from "./figma-api.js";
import { LayoutDirection, NormalizedNode, NormalizedScreen, StyleValue } from "./types.js";

function resolveLayout(node: FigmaNode): LayoutDirection {
  if (node.layoutMode === "HORIZONTAL") {
    return "row";
  }

  if (node.layoutMode === "VERTICAL") {
    return "column";
  }

  return "none";
}

function resolveBackground(node: FigmaNode): string | undefined {
  const visibleFill = node.fills?.find((fill) => fill.visible !== false && fill.type === "SOLID");
  if (!visibleFill) {
    return undefined;
  }

  return figmaColorToCss(visibleFill.color, visibleFill.opacity ?? 1);
}

function resolveNodeKind(node: FigmaNode): NormalizedNode["kind"] {
  if (node.type === "TEXT") {
    return "text";
  }

  if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") {
    return "image";
  }

  const name = (node.name ?? "").trim().toLowerCase();
  if (name.includes("button") || name.startsWith("btn")) {
    return "button";
  }

  return "container";
}

function resolveTextColor(node: FigmaNode): string | undefined {
  const visibleFill = node.fills?.find((fill) => fill.visible !== false && fill.type === "SOLID");
  if (!visibleFill) {
    return undefined;
  }

  return figmaColorToCss(visibleFill.color, visibleFill.opacity ?? 1);
}

function buildStyle(node: FigmaNode): StyleValue {
  const widthPx = clampNumber(node.absoluteBoundingBox?.width);
  const heightPx = clampNumber(node.absoluteBoundingBox?.height);

  const paddingCandidates = [
    node.paddingLeft,
    node.paddingRight,
    node.paddingTop,
    node.paddingBottom,
  ].filter((value): value is number => typeof value === "number");

  const uniformPadding =
    paddingCandidates.length > 0 && paddingCandidates.every((value) => value === paddingCandidates[0])
      ? paddingCandidates[0]
      : undefined;

  return {
    backgroundColor: resolveBackground(node),
    textColor: node.type === "TEXT" ? resolveTextColor(node) : undefined,
    fontSizePx: clampNumber(node.style?.fontSize),
    fontWeight: clampNumber(node.style?.fontWeight),
    widthPx,
    heightPx,
    paddingPx: clampNumber(uniformPadding),
    gapPx: clampNumber(node.itemSpacing),
  };
}

export function normalizeFigmaNode(node: FigmaNode): NormalizedNode {
  const kind = resolveNodeKind(node);
  const children = (node.children ?? [])
    .filter((child) => child.visible !== false)
    .map((child) => normalizeFigmaNode(child));

  return {
    id: node.id,
    name: node.name ?? "",
    kind,
    layout: resolveLayout(node),
    textContent: node.type === "TEXT" ? node.characters ?? "" : undefined,
    style: buildStyle(node),
    children,
  };
}

export function normalizeScreen(screenNode: FigmaNode): NormalizedScreen {
  return {
    id: screenNode.id,
    name: screenNode.name ?? "Screen",
    root: normalizeFigmaNode(screenNode),
  };
}
