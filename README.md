# Figma → Angular Code Generator

> AI-powered pipeline that transforms Figma designs into production-ready Angular standalone components — via CLI or Web UI.

[![Node](https://img.shields.io/badge/Node-18%2B-339933?logo=node.js)](https://nodejs.org)
[![Angular](https://img.shields.io/badge/Angular-Standalone-DD0031?logo=angular)](https://angular.dev)
[![Gemini](https://img.shields.io/badge/Google%20Gemini-AI-4285F4?logo=google)](https://ai.google.dev)
[![Figma](https://img.shields.io/badge/Figma-API%20%26%20MCP-F24E1E?logo=figma)](https://developers.figma.com/docs/rest-api/)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Usage](#usage)
  - [Web UI](#web-ui)
  - [CLI Mode](#cli-mode)
  - [AI-Enhanced Generation](#ai-enhanced-generation)
- [Figma Integration](#figma-integration)
  - [REST API](#figma-rest-api)
  - [MCP Server Integration](#figma-mcp-server-integration)
- [Custom Component Library](#custom-component-library)
- [Generated Output](#generated-output)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [MCP Best Practices](#mcp-best-practices)
- [Limitations](#limitations)
- [License](#license)

---

## Features

| Feature                 | Description                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Template Generation** | Rule-based HTML/SCSS from Figma node tree                                                                                             |
| **AI Generation**       | Google Gemini produces semantic HTML, accessible markup, and SCSS with design tokens                                                  |
| **Custom Components**   | 6-component Angular library (`app-button`, `app-input`, `app-card`, `app-navbar`, `app-avatar`, `app-badge`) injected into AI prompts |
| **Web UI**              | Dark-themed browser interface with drag-and-drop JSON upload, screen selector, AI toggle, and tabbed code preview                     |
| **Design Tokens**       | Auto-extracted SCSS variables for colors, font sizes, weights, and spacing                                                            |
| **Shared Components**   | Automatic extraction of repeated container subtrees                                                                                   |
| **Figma API**           | Fetch files directly from Figma REST API                                                                                              |
| **Figma MCP**           | Compatible with Figma's MCP server for IDE-integrated workflows                                                                       |
| **Offline Mode**        | Works with exported JSON — no API key required                                                                                        |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        INPUT LAYER                           │
├──────────────────────────────────────────────────────────────┤
│  Figma REST API        Exported JSON        Figma MCP Server │
│  (--file flag)         (--json flag)        (IDE integration) │
└───────────┬──────────────┬──────────────────┬────────────────┘
            │              │                  │
            ▼              ▼                  ▼
┌──────────────────────────────────────────────────────────────┐
│                    NORMALIZE LAYER                            │
│  figma-api.ts → normalize.ts → NormalizedScreen              │
└─────────────────────────┬────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
┌──────────────────────┐  ┌────────────────────────────┐
│  Template Generator  │  │     AI Generator           │
│  angular-generator.ts│  │  ai/client.ts              │
│                      │  │  ai/prompts.ts             │
│                      │  │  ai/generator.ts           │
│                      │  │  ai/component-registry.ts  │
└──────────┬───────────┘  └──────────┬─────────────────┘
           │                         │
           ▼                         ▼
┌──────────────────────────────────────────────────────────────┐
│                    OUTPUT LAYER                               │
│  component.ts  ·  component.html  ·  component.scss          │
│  _figma-tokens.scss  ·  preview.json                         │
└──────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

- **Node.js** ≥ 18.17.0
- **Figma personal access token** — required only for `--file` API mode ([create one here](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens))
- **Gemini API key** — required only for `--ai` mode ([get one here](https://aistudio.google.com/apikey))

---

## Setup

```bash
# Clone the repository
git clone https://github.com/your-org/figma-code.git
cd figma-code

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

Edit `.env` with your keys:

```env
FIGMA_TOKEN=your_figma_personal_access_token
GEMINI_API_KEY=your_gemini_api_key
```

Build the project:

```bash
npm run build
```

---

## Usage

### Web UI

Start the browser-based interface:

```bash
npm run serve
```

Open **http://localhost:3000** in your browser. The Web UI provides:

1. **Upload / Paste** — Drag-and-drop a `.json` file or paste Figma JSON directly
2. **Screen Selector** — Pick from auto-detected top-level frames
3. **AI Toggle** — Switch between template-based and AI-enhanced generation
4. **Code Preview** — Tabbed view of generated HTML, SCSS, and TypeScript with copy button

Custom port:

```bash
npm run build && node dist/index.js --serve --port 8080
```

### CLI Mode

**From Figma API** (requires `FIGMA_TOKEN`):

```bash
npm run generate -- \
  --file "https://www.figma.com/file/<FILE_KEY>/Project" \
  --screen "Home Screen" \
  --out "D:/path/to/angular-app"
```

**From exported JSON** (offline):

```bash
npm run generate -- \
  --json "D:/path/to/figma-response.json" \
  --screen "Home Screen" \
  --out "D:/path/to/angular-app"
```

### AI-Enhanced Generation

Add the `--ai` flag to generate semantic HTML with accessibility attributes and design tokens:

```bash
npm run generate -- \
  --json "D:/path/to/figma.json" \
  --screen "Registration Form" \
  --out "D:/path/to/angular-app" \
  --ai \
  --api-key "your_gemini_key"    # Or set GEMINI_API_KEY env var
```

The AI mode uses Gemini to produce:

- Semantic HTML (`<header>`, `<main>`, `<section>`, `<form>`, etc.)
- ARIA labels and proper heading hierarchy
- Custom component usage (`<app-button>`, `<app-card>`, etc.)
- SCSS with design token CSS variables

### CLI Reference

| Flag              | Description                           | Required                    |
| ----------------- | ------------------------------------- | --------------------------- |
| `--file <url>`    | Figma file URL or key (API mode)      | One of `--file` or `--json` |
| `--json <path>`   | Path to exported Figma JSON (offline) | One of `--file` or `--json` |
| `--screen <name>` | Exact frame/component name in Figma   | Yes (CLI mode)              |
| `--out <path>`    | Angular project root path             | No (defaults to `.`)        |
| `--ai`            | Enable AI-enhanced generation         | No                          |
| `--api-key <key>` | Gemini API key (overrides env var)    | Only with `--ai`            |
| `--serve`         | Start the Web UI server               | No                          |
| `--port <number>` | Web UI port (default: 3000)           | No                          |

---

## Figma Integration

### Figma REST API

This tool uses the [Figma REST API](https://developers.figma.com/docs/rest-api/) to fetch file data.

- **Base URL**: `https://api.figma.com`
- **Authentication**: Personal access token via `X-FIGMA-TOKEN` header
- **Primary endpoint**: `GET /v1/files/:key` — returns the full document tree
- **Supported JSON shapes** (for `--json` mode):
  - Full file response: `{ document: ... }`
  - Nodes response: `{ nodes: { "id": { document: ... } } }`
  - Direct node object

#### Getting your Figma file key

From any Figma URL like:

```
https://www.figma.com/file/ABC123xyz/My-Design
```

The file key is `ABC123xyz`.

#### Creating a personal access token

1. Go to **Figma → Settings → Personal access tokens**
2. Click **Generate new token**
3. Give it a descriptive name
4. Copy the token and add it to your `.env` file

> See [Figma's authentication docs](https://developers.figma.com/docs/rest-api/authentication/) for more details.

---

### Figma MCP Server Integration

The [Figma MCP server](https://github.com/figma/mcp-server-guide) brings Figma design context directly into your IDE (VS Code, Cursor, Claude Code), enabling AI agents to generate code from Figma selections.

This project is designed to work **alongside** the Figma MCP server:

1. Use the MCP server's `get_design_context` to extract structured design data
2. Use `get_variable_defs` to pull design tokens (colors, spacing, typography)
3. Feed the extracted data into this generator for Angular-specific output
4. Use `get_screenshot` for visual reference during implementation

#### MCP Server Setup

**Remote server** (no installation required):

```
https://mcp.figma.com/mcp
```

**Desktop server** (requires Figma desktop app):

```
http://127.0.0.1:3845/mcp
```

##### VS Code

1. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> → `MCP: Add Server`
2. Select **HTTP**
3. Enter the server URL
4. Set the server ID to `figma` (remote) or `figma-desktop` (local)

Your `.vscode/mcp.json`:

```json
{
  "servers": {
    "figma": {
      "type": "http",
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

##### Cursor

1. **Settings → Cursor Settings → MCP tab**
2. Click **+ Add new global MCP server**
3. Add configuration:

```json
{
  "mcpServers": {
    "figma": {
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

##### Claude Code

```bash
claude mcp add --transport http figma https://mcp.figma.com/mcp
```

#### MCP Tools Reference

| Tool                         | Purpose                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `get_design_context`         | Structured representation of selected Figma frame (default: React + Tailwind, customizable) |
| `get_variable_defs`          | Extract variables and styles (colors, spacing, typography)                                  |
| `get_code_connect_map`       | Map Figma nodes to code components in your codebase                                         |
| `get_screenshot`             | Visual screenshot of the selection for layout fidelity                                      |
| `create_design_system_rules` | Generate rule files for consistent AI output                                                |

---

## Custom Component Library

The AI generator references a built-in component registry to produce cleaner, more reusable code:

| Component            | Selector       | Inputs                                                              | Outputs         |
| -------------------- | -------------- | ------------------------------------------------------------------- | --------------- |
| `AppButtonComponent` | `<app-button>` | `label`, `variant`, `disabled`, `type`                              | `(clicked)`     |
| `AppInputComponent`  | `<app-input>`  | `label`, `placeholder`, `type`, `value`, `required`, `errorMessage` | `(valueChange)` |
| `AppCardComponent`   | `<app-card>`   | `title`, `subtitle`, `elevated`                                     | —               |
| `AppNavbarComponent` | `<app-navbar>` | `brandName`, `brandLogoUrl`                                         | `(menuToggle)`  |
| `AppAvatarComponent` | `<app-avatar>` | `src`, `alt`, `size`, `initials`                                    | —               |
| `AppBadgeComponent`  | `<app-badge>`  | `text`, `variant`                                                   | —               |

Edit `src/ai/component-registry.ts` to add your own components. The AI prompt is regenerated dynamically, so new components are immediately available.

---

## Generated Output

For a screen named `Home Screen`, the generator produces:

```
src/app/pages/home-screen/
├── home-screen.component.ts       # Standalone Angular component
├── home-screen.component.html     # Template
├── home-screen.component.scss     # Styles with design tokens
└── home-screen.preview.json       # Diagnostics report

src/styles/
└── _figma-tokens.scss             # Extracted design token variables

src/app/components/generated/      # Auto-detected shared components
└── <component-name>/
    ├── <name>.component.ts
    ├── <name>.component.html
    └── <name>.component.scss
```

---

## Project Structure

```
figma-code/
├── src/
│   ├── index.ts                   # CLI entry point
│   ├── server.ts                  # Express web server
│   ├── figma-api.ts               # Figma API client & node utilities
│   ├── normalize.ts               # Figma → NormalizedScreen transformer
│   ├── angular-generator.ts       # Rule-based code generator
│   ├── design-tokens.ts           # Design token extractor
│   ├── shared-components.ts       # Shared component detector
│   ├── types.ts                   # TypeScript interfaces
│   ├── utils.ts                   # String utilities
│   ├── ai/
│   │   ├── client.ts              # Google Gemini wrapper
│   │   ├── prompts.ts             # System & user prompts
│   │   ├── generator.ts           # AI generation orchestrator
│   │   └── component-registry.ts  # Custom component definitions
│   └── web/
│       ├── index.html             # Web UI layout
│       ├── styles.css             # Dark theme styles
│       └── app.js                 # Client-side JavaScript
├── sample/                        # Example Figma JSON files
├── .env.example                   # Environment variable template
├── package.json
├── tsconfig.json
└── README.md
```

---

## Configuration

### Environment Variables

| Variable         | Purpose                                  | Required           |
| ---------------- | ---------------------------------------- | ------------------ |
| `FIGMA_TOKEN`    | Figma personal access token for API mode | Only with `--file` |
| `GEMINI_API_KEY` | Google Gemini API key for AI generation  | Only with `--ai`   |

### Supported JSON Formats

The `--json` flag accepts these Figma export formats:

```jsonc
// 1. Full file response
{ "document": { "children": [...] } }

// 2. Nodes endpoint response
{ "nodes": { "0:1": { "document": { "children": [...] } } } }

// 3. Direct node object
{ "id": "0:1", "name": "Frame", "type": "FRAME", "children": [...] }
```

---

## MCP Best Practices

When using the Figma MCP server with this project, follow these guidelines for the best results:

### Structure your Figma file

- **Use components** for anything reused (buttons, cards, inputs)
- **Link components** to your codebase via [Code Connect](https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect)
- **Use variables** for spacing, color, radius, and typography
- **Name layers semantically** (e.g., `CardContainer`, not `Group 5`)
- **Use Auto Layout** to communicate responsive intent

### Write effective prompts

When prompting your MCP client, be explicit about Angular:

```
"Generate my Figma selection as an Angular standalone component
using components from src/ai/component-registry.ts and SCSS
with design token CSS variables."
```

### Create custom rules

Save this in your IDE's rules directory for consistent output:

```
## Figma MCP Integration Rules

### Required flow
1. Run get_design_context first for the node(s)
2. Run get_screenshot for visual reference
3. Translate output into Angular standalone components
4. Use custom components from component-registry.ts
5. Use design token CSS variables (not hardcoded values)
6. Validate against Figma for 1:1 visual parity

### Implementation rules
- Generate Angular standalone components (standalone: true)
- Use SCSS with CSS custom properties for design tokens
- Import custom components (AppButtonComponent, etc.) in @Component imports
- Use semantic HTML and ARIA attributes
- Follow the project's design token naming convention
```

### Break down large selections

For complex screens, generate individual sections (header, sidebar, cards) separately, then compose them. This produces more reliable results and keeps the AI context manageable.

---

## Limitations

- This is an MVP — not a pixel-perfect conversion tool
- Complex effects, variants, responsive behavior, and interaction logic need manual refinement
- Image export from Figma is stubbed as `assets/<layer-name>.svg` references
- Shared-component extraction targets repeated container subtrees with matching structure/style
- AI generation quality depends on screen complexity and Gemini model capabilities
- Figma MCP server rate limits apply (Tier 1 REST API limits for paid seats)

---

## Scripts

| Script     | Command                       | Description                   |
| ---------- | ----------------------------- | ----------------------------- |
| `build`    | `npm run build`               | Compile TypeScript            |
| `start`    | `npm run start`               | Run the compiled CLI          |
| `serve`    | `npm run serve`               | Build and start the Web UI    |
| `generate` | `npm run generate -- [flags]` | Build and run CLI generation  |
| `dev`      | `npm run dev`                 | Run via ts-node (development) |

---

## License

Private — All rights reserved.
