export type LayoutDirection = "row" | "column" | "none";

export interface StyleValue {
  backgroundColor?: string;
  textColor?: string;
  fontSizePx?: number;
  fontWeight?: number;
  widthPx?: number;
  heightPx?: number;
  paddingPx?: number;
  gapPx?: number;
}

export interface NormalizedNode {
  id: string;
  name: string;
  kind: "container" | "text" | "image" | "button";
  layout: LayoutDirection;
  textContent?: string;
  style: StyleValue;
  children: NormalizedNode[];
}

export interface NormalizedScreen {
  id: string;
  name: string;
  root: NormalizedNode;
}
