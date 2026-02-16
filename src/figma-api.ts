export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface FigmaPaint {
  type: string;
  visible?: boolean;
  color?: FigmaColor;
  opacity?: number;
}

export interface FigmaNode {
  id: string;
  name?: string;
  type: string;
  visible?: boolean;
  children?: FigmaNode[];
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  fills?: FigmaPaint[];
  characters?: string;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    letterSpacing?: number;
    lineHeightPx?: number;
    lineHeightUnit?: "PIXELS" | "FONT_SIZE_%" | "INTRINSIC_%";
    textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
    textDecoration?: "NONE" | "UNDERLINE" | "STRIKETHROUGH";
  };
  effects?: FigmaEffect[];
  absoluteBoundingBox?: {
    width: number;
    height: number;
  };
}

export interface FigmaEffect {
  type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR";
  visible?: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
}

// ─── API Response Interfaces ─────────────────────────────────

export interface FigmaFileResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  document: FigmaNode;
  components: Record<string, FigmaComponentMeta>;
  styles: Record<string, FigmaStyleMeta>;
}

export interface FigmaPublishedStyle {
  key: string;
  file_key: string;
  node_id: string;
  style_type: "FILL" | "TEXT" | "EFFECT" | "GRID";
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  sort_position: string;
}

export interface FigmaPublishedStylesResponse {
  status: number;
  error: boolean;
  meta: {
    styles: FigmaPublishedStyle[];
  };
}

export interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
}

export interface FigmaStyleMeta {
  key: string;
  name: string;
  styleType: "FILL" | "TEXT" | "EFFECT" | "GRID";
  description: string;
}

export interface FigmaNodesResponse {
  nodes: Record<string, { document: FigmaNode; components: Record<string, FigmaComponentMeta> } | null>;
}

export interface FigmaImagesResponse {
  err: string | null;
  images: Record<string, string | null>;
}

export interface FigmaVariable {
  id: string;
  name: string;
  key: string;
  variableCollectionId: string;
  resolvedType: "BOOLEAN" | "FLOAT" | "STRING" | "COLOR";
  valuesByMode: Record<string, unknown>;
  remote: boolean;
  description: string;
  scopes: string[];
}

export interface FigmaVariableCollection {
  id: string;
  name: string;
  key: string;
  modes: { modeId: string; name: string }[];
  defaultModeId: string;
  variableIds: string[];
}

export interface FigmaVariablesResponse {
  status: number;
  error: boolean;
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

export interface FigmaFileOptions {
  depth?: number;
  ids?: string[];
}

export interface FigmaImageOptions {
  format?: "jpg" | "png" | "svg" | "pdf";
  scale?: number;
}

// ─── FigmaClient ─────────────────────────────────────────────

export class FigmaClient {
  private static readonly BASE_URL = "https://api.figma.com";

  constructor(private readonly token: string) { }

  private async _fetch<T>(path: string): Promise<T> {
    const url = `${FigmaClient.BASE_URL}${path}`;
    const response = await fetch(url, {
      headers: { "X-Figma-Token": this.token },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Figma API ${path} failed (${response.status}): ${message}`);
    }

    return (await response.json()) as T;
  }

  /** GET /v1/files/:key — full file tree with metadata */
  async getFile(fileKey: string, opts?: FigmaFileOptions): Promise<FigmaFileResponse> {
    const params = new URLSearchParams();
    if (opts?.depth != null) params.set("depth", String(opts.depth));
    if (opts?.ids?.length) params.set("ids", opts.ids.join(","));
    const qs = params.toString();
    return this._fetch<FigmaFileResponse>(`/v1/files/${fileKey}${qs ? "?" + qs : ""}`);
  }

  /** GET /v1/files/:key/nodes?ids= — fetch specific nodes by ID */
  async getFileNodes(fileKey: string, nodeIds: string[]): Promise<FigmaNodesResponse> {
    const ids = nodeIds.join(",");
    return this._fetch<FigmaNodesResponse>(`/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`);
  }

  /** GET /v1/images/:key?ids= — render nodes as images */
  async getImages(fileKey: string, nodeIds: string[], opts?: FigmaImageOptions): Promise<FigmaImagesResponse> {
    const params = new URLSearchParams();
    params.set("ids", nodeIds.join(","));
    params.set("format", opts?.format ?? "png");
    if (opts?.scale != null) params.set("scale", String(opts.scale));
    return this._fetch<FigmaImagesResponse>(`/v1/images/${fileKey}?${params.toString()}`);
  }

  /** GET /v1/files/:key/variables/local — design variables (Enterprise only) */
  async getLocalVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    return this._fetch<FigmaVariablesResponse>(`/v1/files/${fileKey}/variables/local`);
  }

  /** GET /v1/files/:key/styles — published styles (text, fill, effect, grid) */
  async getFileStyles(fileKey: string): Promise<FigmaPublishedStylesResponse> {
    return this._fetch<FigmaPublishedStylesResponse>(`/v1/files/${fileKey}/styles`);
  }
}

export function extractFileKey(fileUrlOrKey: string): string {
  const trimmed = fileUrlOrKey.trim();

  if (!trimmed.startsWith("http")) {
    return trimmed;
  }

  // Support: /file/, /design/, /board/, /proto/ URL formats
  const match = trimmed.match(/figma\.com\/(?:file|design|board|proto)\/([a-zA-Z0-9]+)/);
  if (!match) {
    throw new Error(
      "Invalid Figma URL. Expected format like https://www.figma.com/design/<FILE_KEY>/... or /file/<FILE_KEY>/..."
    );
  }

  return match[1];
}

/** Extract node ID from a Figma URL query string (?node-id=1:2) */
export function extractNodeId(url: string): string | undefined {
  const match = url.match(/node-id=([^&]+)/);
  if (!match) return undefined;
  return decodeURIComponent(match[1]).replace("-", ":");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFigmaNode(value: unknown): value is FigmaNode {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === "string" && (typeof value.name === "string" || value.name === undefined) && typeof value.type === "string";
}

export function parseFigmaRootFromJsonPayload(payload: unknown): FigmaNode {
  if (isFigmaNode(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    throw new Error("Invalid Figma JSON payload: expected an object.");
  }

  if ("document" in payload && isFigmaNode(payload.document)) {
    return payload.document;
  }

  if ("nodes" in payload && isRecord(payload.nodes)) {
    for (const entry of Object.values(payload.nodes)) {
      if (isRecord(entry) && isFigmaNode(entry.document)) {
        return entry.document;
      }
    }
  }

  throw new Error(
    "Unsupported Figma JSON payload. Expected one of: file response with { document }, nodes response with { nodes: { ... document } }, or a direct node object.",
  );
}

export function findNodeByName(root: FigmaNode, name: string): FigmaNode | undefined {
  const normalizedName = name.trim().toLowerCase();

  const stack: FigmaNode[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if ((current.name?.trim().toLowerCase() ?? "") === normalizedName) {
      return current;
    }

    if (current.children) {
      for (let i = current.children.length - 1; i >= 0; i -= 1) {
        stack.push(current.children[i]);
      }
    }
  }

  return undefined;
}

export function listTopLevelFrameNames(root: FigmaNode): string[] {
  if (!root.children) {
    return [];
  }

  return root.children.flatMap((page) =>
    (page.children ?? [])
      .filter((node) => node.type === "FRAME" || node.type === "COMPONENT")
      .map((node) => node.name ?? "Unnamed Frame"),
  );
}

export function figmaColorToCss(color: FigmaColor | undefined, opacity = 1): string | undefined {
  if (!color) {
    return undefined;
  }

  const red = Math.round(color.r * 255);
  const green = Math.round(color.g * 255);
  const blue = Math.round(color.b * 255);
  const alpha = color.a ?? opacity;

  if (alpha >= 0.999) {
    return `rgb(${red}, ${green}, ${blue})`;
  }

  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
}
