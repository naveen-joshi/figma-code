# Figma MCP Server

A Model Context Protocol (MCP) server that exposes Figma API functionality as tools for LLM applications.

Built with [FastMCP](https://gofastmcp.com/).

## Features

This server provides the following tools:

### File Operations
- **get_figma_file** - Fetch file metadata and summarized document tree
- **get_figma_file_full** - Fetch complete file data (for processing)
- **get_figma_node** - Fetch a specific node by ID
- **list_frames** - List all top-level frames and components
- **find_frame_by_name** - Find a frame/component by name
- **get_frame_full** - Get complete frame data for code generation

### Components & Styles
- **list_components** - List all components in a file
- **get_file_styles** - Get published styles (text, fill, effect, grid)
- **get_file_variables** - Get design variables (Enterprise only)

### Images
- **render_node_image** - Render a node as an image (png, jpg, svg, pdf)

### Comments
- **get_file_comments** - Get all comments from a file

### Team & Project
- **get_team_projects** - List projects in a team
- **get_project_files** - List files in a project

### Utilities
- **parse_figma_url** - Extract file key and node ID from a Figma URL

## Setup

### Prerequisites

- Python 3.10+
- Figma personal access token

### Installation

```bash
cd mcp-server
pip install -r requirements.txt
```

### Configuration

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` and add your Figma token:

```env
FIGMA_TOKEN=your_figma_personal_access_token
```

To get a Figma token:
1. Go to Figma → Settings → Account
2. Scroll to "Personal access tokens"
3. Click "Create new token"

## Running the Server

### stdio mode (for MCP clients like Claude Desktop)

```bash
python server.py
```

Or using FastMCP CLI:

```bash
fastmcp run server.py:mcp
```

### HTTP mode (for remote access)

```bash
fastmcp run server.py:mcp --transport http --port 8000
```

The server will be available at `http://localhost:8000/mcp`

## Usage with Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "figma": {
      "command": "python",
      "args": ["D:/Code/Projects/figma-code/mcp-server/server.py"],
      "env": {
        "FIGMA_TOKEN": "your_token_here"
      }
    }
  }
}
```

Or if using uv:

```json
{
  "mcpServers": {
    "figma": {
      "command": "uv",
      "args": ["run", "python", "D:/Code/Projects/figma-code/mcp-server/server.py"],
      "env": {
        "FIGMA_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Example Tool Calls

### List frames in a file

```python
await client.call_tool("list_frames", {
    "file_url_or_key": "https://www.figma.com/design/ABC123/MyFile"
})
```

### Find a specific frame

```python
await client.call_tool("find_frame_by_name", {
    "file_url_or_key": "ABC123",
    "name": "Home Screen"
})
```

### Render a node as PNG

```python
await client.call_tool("render_node_image", {
    "file_url_or_key": "ABC123",
    "node_id": "1:2",
    "format": "png",
    "scale": 2
})
```

## Development

### Project Structure

```
mcp-server/
├── server.py          # Main MCP server with tool definitions
├── figma_client.py    # Figma API client wrapper
├── utils.py           # Utility functions for node traversal
├── requirements.txt   # Python dependencies
├── .env.example       # Environment variable template
└── README.md          # This file
```

### Adding New Tools

1. Add the API method to `figma_client.py`
2. Add any helper functions to `utils.py`
3. Add the tool function with `@mcp.tool` decorator in `server.py`

```python
@mcp.tool
async def my_new_tool(param: str) -> str:
    """Tool description for the LLM."""
    client = get_client()
    try:
        result = await client.some_method(param)
        return json.dumps(result, indent=2)
    finally:
        await client.close()
```
