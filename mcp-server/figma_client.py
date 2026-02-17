"""Figma API client wrapper for MCP server."""

from typing import Any, Optional
import httpx


class FigmaClient:
    """Client for interacting with the Figma REST API."""

    BASE_URL = "https://api.figma.com"

    def __init__(self, token: str):
        self.token = token
        self._client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            headers={"X-Figma-Token": token},
            timeout=30.0,
        )

    async def _fetch(self, path: str) -> dict[str, Any]:
        """Make authenticated GET request to Figma API."""
        response = await self._client.get(path)
        response.raise_for_status()
        return response.json()

    async def get_file(
        self,
        file_key: str,
        depth: Optional[int] = None,
        node_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """
        GET /v1/files/:key — fetch full file tree with metadata.

        Args:
            file_key: The Figma file key
            depth: Optional depth limit for traversing the document tree
            node_ids: Optional list of specific node IDs to fetch

        Returns:
            File response with document tree, components, and styles
        """
        params = {}
        if depth is not None:
            params["depth"] = str(depth)
        if node_ids:
            params["ids"] = ",".join(node_ids)

        query = "&".join(f"{k}={v}" for k, v in params.items())
        path = f"/v1/files/{file_key}" + (f"?{query}" if query else "")
        return await self._fetch(path)

    async def get_file_nodes(
        self, file_key: str, node_ids: list[str]
    ) -> dict[str, Any]:
        """
        GET /v1/files/:key/nodes?ids= — fetch specific nodes by ID.

        Args:
            file_key: The Figma file key
            node_ids: List of node IDs to fetch

        Returns:
            Nodes response with document subtrees for each requested node
        """
        ids = ",".join(node_ids)
        return await self._fetch(f"/v1/files/{file_key}/nodes?ids={ids}")

    async def get_images(
        self,
        file_key: str,
        node_ids: list[str],
        format: str = "png",
        scale: Optional[float] = None,
    ) -> dict[str, Any]:
        """
        GET /v1/images/:key?ids= — render nodes as images.

        Args:
            file_key: The Figma file key
            node_ids: List of node IDs to render
            format: Image format (jpg, png, svg, pdf)
            scale: Image scale factor (0.01 to 4)

        Returns:
            Images response with URLs for rendered images
        """
        params = {"ids": ",".join(node_ids), "format": format}
        if scale is not None:
            params["scale"] = str(scale)

        query = "&".join(f"{k}={v}" for k, v in params.items())
        return await self._fetch(f"/v1/images/{file_key}?{query}")

    async def get_local_variables(self, file_key: str) -> dict[str, Any]:
        """
        GET /v1/files/:key/variables/local — fetch design variables.

        Note: This endpoint requires Enterprise plan access.

        Args:
            file_key: The Figma file key

        Returns:
            Variables response with variable collections and values
        """
        return await self._fetch(f"/v1/files/{file_key}/variables/local")

    async def get_file_styles(self, file_key: str) -> dict[str, Any]:
        """
        GET /v1/files/:key/styles — fetch published styles.

        Args:
            file_key: The Figma file key

        Returns:
            Styles response with text, fill, effect, and grid styles
        """
        return await self._fetch(f"/v1/files/{file_key}/styles")

    async def get_comments(self, file_key: str) -> dict[str, Any]:
        """
        GET /v1/files/:key/comments — fetch file comments.

        Args:
            file_key: The Figma file key

        Returns:
            Comments response with all comments on the file
        """
        return await self._fetch(f"/v1/files/{file_key}/comments")

    async def get_team_projects(self, team_id: str) -> dict[str, Any]:
        """
        GET /v1/teams/:team_id/projects — list team projects.

        Args:
            team_id: The Figma team ID

        Returns:
            Projects response with list of projects in the team
        """
        return await self._fetch(f"/v1/teams/{team_id}/projects")

    async def get_project_files(self, project_id: str) -> dict[str, Any]:
        """
        GET /v1/projects/:project_id/files — list project files.

        Args:
            project_id: The Figma project ID

        Returns:
            Files response with list of files in the project
        """
        return await self._fetch(f"/v1/projects/{project_id}/files")

    async def get_component_sets(self, file_key: str) -> dict[str, Any]:
        """
        GET /v1/files/:key/component_sets — fetch component sets.

        Args:
            file_key: The Figma file key

        Returns:
            Component sets response with variant information
        """
        return await self._fetch(f"/v1/files/{file_key}/component_sets")

    async def get_components(self, file_key: str) -> dict[str, Any]:
        """
        GET /v1/files/:key/components — fetch file components.

        Args:
            file_key: The Figma file key

        Returns:
            Components response with component metadata
        """
        return await self._fetch(f"/v1/files/{file_key}/components")

    async def close(self):
        """Close the HTTP client."""
        await self._client.aclose()
