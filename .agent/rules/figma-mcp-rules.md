## Figma MCP Integration Rules

These rules define how to translate Figma inputs into Angular code for this project and must be followed for every Figma-driven change.

### Required flow (do not skip)

1. Run `get_design_context` first to fetch the structured representation for the exact node(s).
2. If the response is too large or truncated, run `get_metadata` to get the high-level node map, then re-fetch only the required node(s) with `get_design_context`.
3. Run `get_screenshot` for a visual reference of the node variant being implemented.
4. Only after you have both `get_design_context` and `get_screenshot`, download any assets needed and start implementation.
5. Translate the output (usually React + Tailwind) into this project's Angular conventions, styles, and framework.
6. Reuse the project's color tokens, custom components, and typography wherever possible.
7. Validate against Figma for 1:1 look and behavior before marking complete.

### Implementation rules

- **Framework**: Generate Angular standalone components (standalone: true).
- **Styling**: Use SCSS with CSS custom property design tokens (e.g., `var(--color-primary)`, `var(--spacing-md)`).
- **Custom Components**: Always use components from `src/ai/component-registry.ts` when possible:
  - `<app-button>` for buttons
  - `<app-input>` for form inputs
  - `<app-card>` for content containers
  - `<app-navbar>` for navigation bars
  - `<app-avatar>` for user avatars
  - `<app-badge>` for status badges
- **Imports**: Import all custom components in the `@Component.imports` array.
- **Semantic HTML**: Use `<header>`, `<main>`, `<section>`, `<article>`, `<nav>`, `<footer>` instead of `<div>` soup.
- **Accessibility**: Add ARIA labels, roles, and proper heading hierarchy (h1-h6).
- **Avoid hardcoded values**: Use design tokens from Figma where available.
- **Assets**: If the Figma MCP server returns a localhost source for an image or SVG, use that source directly. Do NOT import new icon packages.
- **File placement**: Place generated page components in `src/app/pages/<screen-name>/` and shared components in `src/app/components/generated/<name>/`.

### Design tokens

Available CSS custom properties:

- **Colors**: `--color-primary`, `--color-secondary`, `--color-background`, `--color-surface`, `--color-text`, `--color-text-secondary`, `--color-border`, `--color-error`, `--color-success`
- **Spacing**: `--spacing-xs`, `--spacing-sm`, `--spacing-md`, `--spacing-lg`, `--spacing-xl`
- **Radii**: `--radius-sm`, `--radius-md`, `--radius-lg`
- **Shadows**: `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- **Typography**: `--font-family`, `--font-size-sm`, `--font-size-md`, `--font-size-lg`, `--font-size-xl`
