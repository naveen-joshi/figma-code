import { NormalizedScreen } from "../types.js";

/**
 * Build the system prompt for React code generation via Gemini.
 */
export function buildReactSystemPrompt(): string {
    return [
        "You are an expert React developer and UI/UX designer.",
        "Your task is to generate production-ready React code from a normalized Figma design tree.",
        "",
        "### Output Requirements",
        "1. **Functional Components**: Generate modern React functional components using TypeScript (.tsx).",
        "2. **CSS Modules**: All styles must use CSS Modules (.module.css). Use camelCase class names.",
        "3. **Semantic HTML**: Use semantic HTML (<header>, <main>, <section>, <article>, <nav>, <footer>, etc.).",
        "4. **Accessibility**: Add aria-labels, roles, and proper heading hierarchy (h1-h6).",
        "5. **Event Handlers**: Implement empty handler functions for interactive elements (e.g., handleSubmit, handleClick).",
        "6. **Hooks**: Use React hooks (useState, useEffect) where appropriate for interactive elements.",
        "7. **No External Dependencies**: Do not use any UI libraries — write everything with plain React + CSS.",
        "8. **Structure**: Return a JSON object with keys: \"tsx\", \"css\".",
        "",
        "### Design Tokens",
        "These CSS custom properties are available globally:",
        "- Colors: var(--color-primary), var(--color-secondary), var(--color-background), var(--color-surface), var(--color-text), var(--color-text-secondary), var(--color-border), var(--color-error), var(--color-success)",
        "- Spacing: var(--spacing-xs), var(--spacing-sm), var(--spacing-md), var(--spacing-lg), var(--spacing-xl)",
        "- Radii: var(--radius-sm), var(--radius-md), var(--radius-lg)",
        "- Shadows: var(--shadow-sm), var(--shadow-md), var(--shadow-lg)",
        "- Typography: var(--font-family), var(--font-size-sm), var(--font-size-md), var(--font-size-lg), var(--font-size-xl)",
    ].join("\n");
}

/**
 * Build the user prompt with the normalized screen data.
 */
export function buildReactUserPrompt(screen: NormalizedScreen): string {
    const rootJson = JSON.stringify(screen.root, null, 2);

    return [
        "Generate a React functional component for the following screen:",
        "Name: " + screen.name,
        "Root Node: " + rootJson,
        "",
        "Rules:",
        "- Use CSS Modules (import styles from './ComponentName.module.css').",
        "- Use className={styles.someClass} for all styling.",
        "- Make the component a default export.",
        '- The component name should be PascalCase.',
        "- Use TypeScript (.tsx syntax).",
        "- Import React at the top.",
        "",
        "Provide the output as a valid JSON object strictly matching this interface:",
        "{",
        '  "tsx": "string",',
        '  "css": "string"',
        "}",
        "Do not include markdown code blocks. Just the raw JSON string.",
    ].join("\n");
}
