"""Utility functions for Figma MCP server."""

import re
from typing import Any, Optional


def extract_file_key(file_url_or_key: str) -> str:
    """
    Extract file key from a Figma URL or return the key if already provided.

    Supports URL formats:
    - https://www.figma.com/file/<KEY>/...
    - https://www.figma.com/design/<KEY>/...
    - https://www.figma.com/board/<KEY>/...
    - https://www.figma.com/proto/<KEY>/...

    Args:
        file_url_or_key: Figma file URL or file key

    Returns:
        The extracted file key

    Raises:
        ValueError: If URL format is invalid
    """
    trimmed = file_url_or_key.strip()

    if not trimmed.startswith("http"):
        return trimmed

    match = re.search(r"figma\.com/(?:file|design|board|proto)/([a-zA-Z0-9]+)", trimmed)
    if not match:
        raise ValueError(
            "Invalid Figma URL. Expected format like "
            "https://www.figma.com/design/<FILE_KEY>/... or /file/<FILE_KEY>/..."
        )

    return match.group(1)


def extract_node_id(url: str) -> Optional[str]:
    """
    Extract node ID from a Figma URL query string.

    Args:
        url: Figma URL potentially containing ?node-id=...

    Returns:
        The node ID if found, None otherwise
    """
    match = re.search(r"node-id=([^&]+)", url)
    if not match:
        return None

    return match.group(1).replace("-", ":")


def find_node_by_name(root: dict[str, Any], name: str) -> Optional[dict[str, Any]]:
    """
    Find a node by name in the Figma document tree.

    Args:
        root: Root node of the document tree
        name: Name to search for (case-insensitive)

    Returns:
        The matching node if found, None otherwise
    """
    normalized_name = name.strip().lower()

    stack = [root]
    while stack:
        current = stack.pop()
        if not current:
            continue

        current_name = current.get("name", "")
        if current_name and current_name.strip().lower() == normalized_name:
            return current

        children = current.get("children", [])
        for child in reversed(children):
            stack.append(child)

    return None


def find_node_by_id(root: dict[str, Any], node_id: str) -> Optional[dict[str, Any]]:
    """
    Find a node by ID in the Figma document tree.

    Args:
        root: Root node of the document tree
        node_id: Node ID to search for

    Returns:
        The matching node if found, None otherwise
    """
    stack = [root]
    while stack:
        current = stack.pop()
        if not current:
            continue

        if current.get("id") == node_id:
            return current

        children = current.get("children", [])
        for child in reversed(children):
            stack.append(child)

    return None


def list_top_level_frames(root: dict[str, Any]) -> list[dict[str, str]]:
    """
    List all top-level frames and components in the document.

    Args:
        root: Root node of the document tree

    Returns:
        List of dicts with 'id', 'name', and 'type' for each frame/component
    """
    frames = []

    pages = root.get("children", [])
    for page in pages:
        page_children = page.get("children", [])
        for node in page_children:
            node_type = node.get("type", "")
            if node_type in ("FRAME", "COMPONENT", "COMPONENT_SET"):
                frames.append({
                    "id": node.get("id", ""),
                    "name": node.get("name", "Unnamed"),
                    "type": node_type,
                    "page": page.get("name", "Unnamed Page"),
                })

    return frames


def list_all_components(root: dict[str, Any]) -> list[dict[str, str]]:
    """
    List all components in the document tree.

    Args:
        root: Root node of the document tree

    Returns:
        List of dicts with 'id', 'name', and 'type' for each component
    """
    components = []

    def walk(node: dict[str, Any]):
        node_type = node.get("type", "")
        if node_type in ("COMPONENT", "COMPONENT_SET", "INSTANCE"):
            components.append({
                "id": node.get("id", ""),
                "name": node.get("name", "Unnamed"),
                "type": node_type,
            })

        for child in node.get("children", []):
            walk(child)

    walk(root)
    return components


def get_node_styles(node: dict[str, Any]) -> dict[str, Any]:
    """
    Extract style information from a node.

    Args:
        node: Figma node

    Returns:
        Dict with extracted style properties
    """
    styles = {}

    if "fills" in node:
        styles["fills"] = node["fills"]

    if "strokes" in node:
        styles["strokes"] = node["strokes"]

    if "effects" in node:
        styles["effects"] = node["effects"]

    if "style" in node:
        styles["textStyle"] = node["style"]

    if "absoluteBoundingBox" in node:
        styles["boundingBox"] = node["absoluteBoundingBox"]

    if "layoutMode" in node:
        styles["layout"] = {
            "mode": node.get("layoutMode"),
            "itemSpacing": node.get("itemSpacing"),
            "paddingLeft": node.get("paddingLeft"),
            "paddingRight": node.get("paddingRight"),
            "paddingTop": node.get("paddingTop"),
            "paddingBottom": node.get("paddingBottom"),
        }

    return styles


def figma_color_to_css(color: Optional[dict[str, float]], opacity: float = 1.0) -> Optional[str]:
    """
    Convert Figma color to CSS color string.

    Args:
        color: Figma color dict with r, g, b, a values (0-1 range)
        opacity: Additional opacity multiplier

    Returns:
        CSS color string or None if no color provided
    """
    if not color:
        return None

    r = round(color.get("r", 0) * 255)
    g = round(color.get("g", 0) * 255)
    b = round(color.get("b", 0) * 255)
    a = color.get("a", 1.0) * opacity

    if a >= 0.999:
        return f"rgb({r}, {g}, {b})"

    return f"rgba({r}, {g}, {b}, {a:.3f})"


def summarize_node(node: dict[str, Any], include_children: bool = False) -> dict[str, Any]:
    """
    Create a summary of a node for display.

    Args:
        node: Figma node
        include_children: Whether to include child summaries

    Returns:
        Summarized node information
    """
    summary = {
        "id": node.get("id"),
        "name": node.get("name"),
        "type": node.get("type"),
    }

    if "absoluteBoundingBox" in node:
        box = node["absoluteBoundingBox"]
        summary["size"] = {
            "width": box.get("width"),
            "height": box.get("height"),
        }

    if node.get("type") == "TEXT":
        summary["characters"] = node.get("characters", "")[:100]

    if include_children:
        children = node.get("children", [])
        summary["childCount"] = len(children)
        summary["children"] = [
            summarize_node(child, include_children=False) for child in children[:10]
        ]
        if len(children) > 10:
            summary["childrenTruncated"] = True

    return summary
