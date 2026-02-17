"""Figma MCP Server - Expose Figma API as MCP tools."""

import os
import json
from typing import Optional

from dotenv import load_dotenv
from fastmcp import FastMCP

from figma_client import FigmaClient
from utils import (
    extract_file_key,
    extract_node_id,
    find_node_by_name,
    find_node_by_id,
    list_top_level_frames,
    list_all_components,
    get_node_styles,
    summarize_node,
)

load_dotenv()

mcp = FastMCP(
    name="Figma MCP Server",
    instructions="""
    This server provides tools to interact with the Figma API.
    You can fetch file data, find nodes, list frames/components, and render images.
    
    Most tools require a file_key or file_url parameter. You can provide either:
    - A Figma file URL (e.g., https://www.figma.com/design/ABC123/MyFile)
    - A file key directly (e.g., ABC123)
    
    The FIGMA_TOKEN environment variable must be set for API access.
    """,
)


def get_client() -> FigmaClient:
    """Get configured Figma client."""
    token = os.environ.get("FIGMA_TOKEN")
    if not token:
        raise ValueError("FIGMA_TOKEN environment variable is required")
    return FigmaClient(token)


@mcp.tool
async def get_figma_file(
    file_url_or_key: str,
    depth: Optional[int] = None,
) -> str:
    """
    Fetch a Figma file's full document tree and metadata.

    Args:
        file_url_or_key: Figma file URL or file key
        depth: Optional depth limit for document tree traversal

    Returns:
        JSON string with file name, document tree, components, and styles
    """
    client = get_client()
    try:
        file_key = extract_file_key(file_url_or_key)
        result = await client.get_file(file_key, depth=depth)
        return json.dumps({
            "name": result.get("name"),
            "lastModified": result.get("lastModified"),
            "version": result.get("version"),
            "document": summarize_node(result.get("document", {}), include_children=True),
            "componentCount": len(result.get("components", {})),
            "styleCount": len(result.get("styles", {})),
        }, indent=2)
    finally:
        await client.close()


@mcp.tool
async def get_figma_file_full(
    file_url_or_key: str,
    depth: Optional[int] = None,
) -> str:
    """
    Fetch a Figma file's complete document tree (full data, not summarized).

    Use this when you need the complete node data for processing.

    Args:
        file_url_or_key: Figma file URL or file key
        depth: Optional depth limit for document tree traversal

    Returns:
        JSON string with complete file data
    """
    client = get_client()
    try:
        file_key = extract_file_key(file_url_or_key)
        result = await client.get_file(file_key, depth=depth)
        return json.dumps(result, indent=2)
    finally:
        await client.close()


@mcp.tool
async def get_figma_node(
    file_url_or_key: str,
    node_id: str,
) -> str:
    """
    Fetch a specific node by ID from a Figma file.

    Args:
        file_url_or_key: Figma file URL or file key
        node_id: The node ID to fetch (e.g., "1:2" or "1-2")

    Returns:
        JSON string with the node's document subtree
    """
    client = get_client()
    try:
        file_key = extract_file_key(file_url_or_key)
        normalized_id = node_id.replace("-", ":")
        result = await client.get_file_nodes(file_key, [normalized_id])

        nodes = result.get("nodes", {})
        node_data = nodes.get(normalized_id)

        if not node_data:
            return json.dumps({"error": f"Node {node_id} not found"})

        return json.dumps({
            "node": summarize_node(node_data.get("document", {}), include_children=True),
        }, indent=2)
    finally:
        await client.close()


@mcp.tool
async def list_frames(file_url_or_key: str) -> str:
    """
    List all top-level frames and components in a Figma file.

    Args:
        file_url_or_key: Figma file URL or file key

    Returns:
        JSON string with list of frames including id, name, type, and page
    """
    client = get_client()
    try:
        file_key = extract_file_key(file_url_or_key)
        result = await client.get_file(file_key, depth=2)
        document = result.get("document", {})
        frames = list_top_level_frames(document)
        return json.dumps({
            "fileName": result.get("name"),
            "frameCount": len(frames),
            "frames": frames,
        }, indent=2)
    finally:
        await client.close()


@mcp.tool
async def find_frame_by_name(
    file_url_or_key: str,
    name: str,
) -> str:
    """
    Find a frame or component by name in a Figma file.

    Args:
        file_url_or_key: Figma file URL or file key
        name: Name of the frame/component to find (case-insensitive)

    Returns:
        JSON string with the found node's details or error if not found
    """
    client = get_client()
    try:
        file_key = extract_file_key(file_url_or_key)
        result = await client.get_file(file_key)
        document = result.get("document", {})

        node = find_node_by_name(document, name)
        if not node:
            frames = list_top_level_frames(document)
            frame_names = [f["name"] for f in frames[:20]]
            return json.dumps({
                "error": f"Frame '{name}' not found",
                "availableFrames": frame_names,
                "hint": "Try one of the available frame names listed above",
            }, indent=2)

        return json.dumps({
            "found": True,
            "node": summarize_node(node, include_children=True),
            "styles": get_node_styles(node),
        }, indent=2)
    finally:
        await client.close()


@mcp.tool
async def get_frame_full(
    file_url_or_key: str,
    name: str,
) -> str:
    """
    Get complete data for a frame by name (for code generation).

    Args:
        file_url_or_key: Figma file URL or file key
        name: Name of the frame/component to find (case-insensitive)

    Returns:
        JSON string with complete node data for processing
    """
    client = get_client()
    try:
        file_key = extract_file_key(file_url_or_key)
        result = await client.get_file(file_key)
        document = result.get("document", {})

        node = find_node_by_name(document, name)
        if not node:
            return json.dumps({"error": f"Frame '{name}' not found"})

        return json.dumps(node, indent=2)
    finally:
        await client.close()


@mcp.tool
async def list_components(file_url_or_key: str) -> str:
    """
    List all components in a Figma file.

    Args:
        file_url_or_key: Figma file URL or file key

    Returns:
        JSON string with list of components including id, name, and type
    """
    client = get_client()
    try:
        file_key = extract_file_key(file_url_or_key)
        result = await client.get_file(file_key)
        document = result.get("document", {})
        components = list_all_components(document)
        return json.dumps({
            "fileName": result.get("name"),
            "componentCount": len(components),
            "components": components,
        }, indent=2)
    finally:
        await client.close()


@mcp.tool
async def get_file_styles(file_url_or_key: str) -> str:
    """
    Get published styles from a Figma file (text, fill, effect, grid).

    Args:
        file_url_or_key: Figma file URL or file key

    Returns:
        JSON string with style definitions
    """
    client = get_client()
    try:
        file_key = extract_file_key(file_url_or_key)
        result = await client.get_file_styles(file_key)
        return json.dumps(result, indent=2)
    finally:
        await client.close()


@mcp.tool
async def get_file_variables(file_url_or_key: str) -> str:
    """
    Get design variables from a Figma file (Enterprise feature).

    Args:
        file_url_or_key: Figma file URL or file key

    Returns:
        JSON string with variable collections and values
    """
    client = get_client()
    try:
        file_key = extract_file_key(file_url_or_key)
        result = await client.get_local_variables(file_key)
        return json.dumps(result, indent=2)
    finally:
        await client.close()


@mcp.tool
async def render_node_image(
    file_url_or_key: str,
    node_id: str,
    format: str = "png",
    scale: Optional[float] = None,
) -> str:
    """
    Render a node as an image and get the download URL.

    Args:
        file_url_or_key: Figma file URL or file key
        node_id: The node ID to render (e.g., "1:2" or "1-2")
        format: Image format - jpg, png, svg, or pdf (default: png)
        scale: Scale factor from 0.01 to 4 (default: 1)

    Returns:
        JSON string with image URL
    """
    client = get_client()
    try:
        file_key = extract_file_key(file_url_or_key)
        normalized_id = node_id.replace("-", ":")
        result = await client.get_images(
            file_key,
            [normalized_id],
            format=format,
            scale=scale,
        )

        images = result.get("images", {})
        image_url = images.get(normalized_id)

        if not image_url:
            return json.dumps({
                "error": f"Failed to render node {node_id}",
                "details": result.get("err"),
            })

        return json.dumps({
            "nodeId": node_id,
            "format": format,
            "imageUrl": image_url,
        }, indent=2)
    finally:
        await client.close()


@mcp.tool
async def get_file_comments(file_url_or_key: str) -> str:
    """
    Get all comments from a Figma file.

    Args:
        file_url_or_key: Figma file URL or file key

    Returns:
        JSON string with file comments
    """
    client = get_client()
    try:
        file_key = extract_file_key(file_url_or_key)
        result = await client.get_comments(file_key)
        return json.dumps(result, indent=2)
    finally:
        await client.close()


@mcp.tool
async def get_team_projects(team_id: str) -> str:
    """
    List all projects in a Figma team.

    Args:
        team_id: The Figma team ID

    Returns:
        JSON string with list of projects
    """
    client = get_client()
    try:
        result = await client.get_team_projects(team_id)
        return json.dumps(result, indent=2)
    finally:
        await client.close()


@mcp.tool
async def get_project_files(project_id: str) -> str:
    """
    List all files in a Figma project.

    Args:
        project_id: The Figma project ID

    Returns:
        JSON string with list of files
    """
    client = get_client()
    try:
        result = await client.get_project_files(project_id)
        return json.dumps(result, indent=2)
    finally:
        await client.close()


@mcp.tool
def parse_figma_url(url: str) -> str:
    """
    Parse a Figma URL to extract file key and node ID.

    Args:
        url: Figma URL to parse

    Returns:
        JSON string with extracted file_key and node_id (if present)
    """
    try:
        file_key = extract_file_key(url)
        node_id = extract_node_id(url)
        return json.dumps({
            "fileKey": file_key,
            "nodeId": node_id,
            "url": url,
        }, indent=2)
    except ValueError as e:
        return json.dumps({"error": str(e)})


if __name__ == "__main__":
    mcp.run()
