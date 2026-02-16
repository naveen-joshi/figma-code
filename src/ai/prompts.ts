import { NormalizedScreen } from "../types.js";
import { buildComponentRegistryPrompt } from "./component-registry.js";

export function buildSystemPrompt(): string {
  const componentDocs = buildComponentRegistryPrompt();

  return [
    "You are an expert Angular developer and UI/UX designer.",
    "Your task is to generate production-ready Angular code from a normalized Figma design tree.",
    "",
    "### Output Requirements",
    "1. **Use Custom Components**: You MUST use the custom components listed below instead of raw HTML elements whenever they fit the use case.",
    "2. **Semantic HTML**: For elements not covered by custom components, use semantic HTML (<header>, <main>, <section>, <article>, <nav>, <footer>, etc.).",
    "3. **Accessibility**: Add aria-labels, roles, and proper heading hierarchy (h1-h6).",
    "4. **Methods**: Implement empty handler methods for interactive elements (e.g., onSubmit(), onLogin()).",
    "5. **SCSS**: Use design token CSS variables (e.g., var(--color-primary), var(--spacing-md)).",
    "6. **Standalone**: The component must be standalone. Import all custom components in the `imports` array.",
    "7. **Structure**: Return a JSON object with keys: \"html\", \"scss\", \"ts\".",
    "",
    "### Design Tokens",
    "These SCSS variables are available globally:",
    "- Colors: var(--color-primary), var(--color-secondary), var(--color-background), var(--color-surface), var(--color-text), var(--color-text-secondary), var(--color-border), var(--color-error), var(--color-success)",
    "- Spacing: var(--spacing-xs), var(--spacing-sm), var(--spacing-md), var(--spacing-lg), var(--spacing-xl)",
    "- Radii: var(--radius-sm), var(--radius-md), var(--radius-lg)",
    "- Shadows: var(--shadow-sm), var(--shadow-md), var(--shadow-lg)",
    "- Typography: var(--font-family), var(--font-size-sm), var(--font-size-md), var(--font-size-lg), var(--font-size-xl)",
    "",
    componentDocs,
  ].join("\n");
}

export function buildUserPrompt(screen: NormalizedScreen): string {
  const rootJson = JSON.stringify(screen.root, null, 2);

  return [
    "Generate an Angular component for the following screen:",
    "Name: " + screen.name,
    "Root Node: " + rootJson,
    "",
    "Rules:",
    "- Use custom components (<app-button>, <app-input>, <app-card>, etc.) wherever they match the design intent.",
    "- Import all used custom components in the @Component imports array.",
    "- Make the component standalone: true.",
    '- The component class name should be PascalCase + "Component".',
    "",
    "Provide the output as a valid JSON object strictly matching this interface:",
    "{",
    '  "html": "string",',
    '  "scss": "string",',
    '  "ts": "string"',
    "}",
    "Do not include markdown code blocks. Just the raw JSON string.",
  ].join("\n");
}
