import { NormalizedNode } from "./types.js";
import { toKebabCase } from "./utils.js";

export interface SharedComponentDefinition {
  componentName: string;
  selector: string;
  signature: string;
  rootNode: NormalizedNode;
  occurrences: number;
}

interface SignatureBucket {
  count: number;
  sampleNode: NormalizedNode;
}

function sortObjectKeys<T>(value: T): T {
  if (Array.isArray(value) || typeof value !== "object" || value === null) {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => [key, sortObjectKeys(entry)]);

  return Object.fromEntries(entries) as T;
}

export function buildNodeSignature(node: NormalizedNode): string {
  const normalized = {
    kind: node.kind,
    layout: node.layout,
    textContent: node.kind === "text" ? node.textContent ?? "" : undefined,
    style: {
      backgroundColor: node.style.backgroundColor,
      textColor: node.style.textColor,
      fontSizePx: node.style.fontSizePx,
      fontWeight: node.style.fontWeight,
      widthPx: node.style.widthPx,
      heightPx: node.style.heightPx,
      paddingPx: node.style.paddingPx,
      gapPx: node.style.gapPx,
    },
    children: node.children.map((child) => buildNodeSignature(child)),
  };

  return JSON.stringify(sortObjectKeys(normalized));
}

function walk(node: NormalizedNode, visitor: (current: NormalizedNode) => void): void {
  visitor(node);
  node.children.forEach((child) => walk(child, visitor));
}

export function extractSharedComponents(root: NormalizedNode): SharedComponentDefinition[] {
  const signatureBuckets = new Map<string, SignatureBucket>();

  walk(root, (current) => {
    if (current.kind !== "container" || current.children.length < 2) {
      return;
    }

    const signature = buildNodeSignature(current);
    const bucket = signatureBuckets.get(signature);
    if (!bucket) {
      signatureBuckets.set(signature, {
        count: 1,
        sampleNode: current,
      });
      return;
    }

    bucket.count += 1;
  });

  let index = 1;
  const seenNames = new Set<string>();

  return [...signatureBuckets.entries()]
    .filter(([, bucket]) => bucket.count >= 2)
    .map(([signature, bucket]) => {
      const base = toKebabCase(bucket.sampleNode.name);
      let componentName = `${base}-shared`;

      while (seenNames.has(componentName)) {
        componentName = `${base}-shared-${index}`;
        index += 1;
      }
      seenNames.add(componentName);

      return {
        componentName,
        selector: `app-${componentName}`,
        signature,
        rootNode: bucket.sampleNode,
        occurrences: bucket.count,
      };
    });
}
