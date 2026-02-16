import { NormalizedNode } from "./types.js";
import { SharedComponentDefinition } from "./shared-components.js";
import { TokenResolver } from "./design-tokens.js";

interface NodeStats {
  total: number;
  byKind: Record<string, number>;
  byLayout: Record<string, number>;
  maxDepth: number;
}

export interface PreviewReport {
  generatedAt: string;
  screen: {
    name: string;
    id: string;
    componentName: string;
  };
  outputs: {
    pageDir: string;
    tokenFile: string;
    previewFile: string;
  };
  tokens: {
    colors: Array<{ value: string; variable: string }>;
    fontSizes: Array<{ value: number; variable: string }>;
    fontWeights: Array<{ value: number; variable: string }>;
    spacings: Array<{ value: number; variable: string }>;
  };
  sharedComponents: Array<{
    componentName: string;
    selector: string;
    occurrences: number;
    signaturePreview: string;
  }>;
  screenTreeStats: NodeStats;
}

function walk(node: NormalizedNode, depth: number, visitor: (current: NormalizedNode, depth: number) => void): void {
  visitor(node, depth);
  node.children.forEach((child) => walk(child, depth + 1, visitor));
}

export function buildNodeStats(root: NormalizedNode): NodeStats {
  const byKind: Record<string, number> = {};
  const byLayout: Record<string, number> = {};

  let total = 0;
  let maxDepth = 0;

  walk(root, 1, (current, depth) => {
    total += 1;
    maxDepth = Math.max(maxDepth, depth);

    byKind[current.kind] = (byKind[current.kind] ?? 0) + 1;
    byLayout[current.layout] = (byLayout[current.layout] ?? 0) + 1;
  });

  return {
    total,
    byKind,
    byLayout,
    maxDepth,
  };
}

function tokenEntriesFromMap<V extends string | number>(map: Map<V, string>): Array<{ value: V; variable: string }> {
  return [...map.entries()].map(([value, variable]) => ({ value, variable }));
}

export function buildPreviewReport(params: {
  screenName: string;
  screenId: string;
  componentName: string;
  pageDir: string;
  tokenFile: string;
  previewFile: string;
  rootNode: NormalizedNode;
  tokenResolver: TokenResolver;
  sharedDefinitions: SharedComponentDefinition[];
}): PreviewReport {
  return {
    generatedAt: new Date().toISOString(),
    screen: {
      name: params.screenName,
      id: params.screenId,
      componentName: params.componentName,
    },
    outputs: {
      pageDir: params.pageDir,
      tokenFile: params.tokenFile,
      previewFile: params.previewFile,
    },
    tokens: {
      colors: tokenEntriesFromMap(params.tokenResolver.colorVarByValue),
      fontSizes: tokenEntriesFromMap(params.tokenResolver.fontSizeVarByValue),
      fontWeights: tokenEntriesFromMap(params.tokenResolver.fontWeightVarByValue),
      spacings: tokenEntriesFromMap(params.tokenResolver.spacingVarByValue),
    },
    sharedComponents: params.sharedDefinitions.map((entry) => ({
      componentName: entry.componentName,
      selector: entry.selector,
      occurrences: entry.occurrences,
      signaturePreview: entry.signature.slice(0, 140),
    })),
    screenTreeStats: buildNodeStats(params.rootNode),
  };
}
