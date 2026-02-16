/**
 * Custom Angular Component Registry
 *
 * Defines a catalog of reusable UI components that the AI should
 * prefer when generating Angular code from Figma designs.
 */

export interface ComponentInput {
    name: string;
    type: string;
    default?: string;
    description: string;
}

export interface ComponentOutput {
    name: string;
    type: string;
    description: string;
}

export interface RegisteredComponent {
    /** Display name, e.g. "AppButtonComponent" */
    className: string;
    /** Angular selector, e.g. "app-button" */
    selector: string;
    /** Import path relative to the generated component */
    importPath: string;
    /** Short description for the AI prompt */
    description: string;
    /** @Input() properties */
    inputs: ComponentInput[];
    /** @Output() event emitters */
    outputs: ComponentOutput[];
    /** Example usage in a template */
    usageExample: string;
}

// ─── Registry ───────────────────────────────────────────────

export const COMPONENT_REGISTRY: RegisteredComponent[] = [
    {
        className: "AppButtonComponent",
        selector: "app-button",
        importPath: "@shared/components/button",
        description:
            "A styled button with variant support. Use instead of raw <button> elements.",
        inputs: [
            { name: "label", type: "string", description: "Button text" },
            {
                name: "variant",
                type: "'primary' | 'secondary' | 'outline' | 'danger'",
                default: "'primary'",
                description: "Visual style variant",
            },
            {
                name: "disabled",
                type: "boolean",
                default: "false",
                description: "Whether the button is disabled",
            },
            {
                name: "type",
                type: "'button' | 'submit' | 'reset'",
                default: "'button'",
                description: "HTML button type",
            },
            {
                name: "fullWidth",
                type: "boolean",
                default: "false",
                description: "Stretch to fill container width",
            },
        ],
        outputs: [
            {
                name: "clicked",
                type: "void",
                description: "Emitted when the button is clicked",
            },
        ],
        usageExample: `<app-button label="Sign Up" variant="primary" (clicked)="onSignUp()"></app-button>`,
    },

    {
        className: "AppInputComponent",
        selector: "app-input",
        importPath: "@shared/components/input",
        description:
            "A labeled form input with validation support. Use instead of raw <input> + <label> pairs.",
        inputs: [
            { name: "label", type: "string", description: "Label text above the input" },
            { name: "placeholder", type: "string", default: "''", description: "Placeholder text" },
            {
                name: "type",
                type: "'text' | 'email' | 'password' | 'number' | 'tel'",
                default: "'text'",
                description: "HTML input type",
            },
            { name: "required", type: "boolean", default: "false", description: "Whether the field is required" },
            { name: "errorMessage", type: "string", description: "Validation error message to display" },
        ],
        outputs: [
            {
                name: "valueChange",
                type: "string",
                description: "Emitted when the input value changes",
            },
        ],
        usageExample: `<app-input label="Email" type="email" placeholder="you@example.com" [required]="true" (valueChange)="onEmailChange($event)"></app-input>`,
    },

    {
        className: "AppCardComponent",
        selector: "app-card",
        importPath: "@shared/components/card",
        description:
            "A content container card with optional title and elevation. Use for grouping related content.",
        inputs: [
            { name: "title", type: "string", description: "Card header title" },
            { name: "subtitle", type: "string", description: "Card header subtitle" },
            { name: "elevated", type: "boolean", default: "true", description: "Adds shadow elevation" },
            { name: "padding", type: "'none' | 'sm' | 'md' | 'lg'", default: "'md'", description: "Inner padding size" },
        ],
        outputs: [],
        usageExample: `<app-card title="Account Settings" subtitle="Manage your profile" [elevated]="true">
  <p>Card body content goes here.</p>
</app-card>`,
    },

    {
        className: "AppNavbarComponent",
        selector: "app-navbar",
        importPath: "@shared/components/navbar",
        description:
            "A responsive top navigation bar. Use for page-level navigation.",
        inputs: [
            { name: "brand", type: "string", description: "Brand name or logo text" },
            { name: "sticky", type: "boolean", default: "true", description: "Whether the navbar is sticky" },
        ],
        outputs: [
            {
                name: "menuClick",
                type: "void",
                description: "Emitted when the hamburger menu is clicked",
            },
        ],
        usageExample: `<app-navbar brand="MyApp" [sticky]="true" (menuClick)="toggleSidebar()"></app-navbar>`,
    },

    {
        className: "AppAvatarComponent",
        selector: "app-avatar",
        importPath: "@shared/components/avatar",
        description:
            "A user avatar with image or initials fallback. Use for profile pictures.",
        inputs: [
            { name: "src", type: "string", description: "Image URL" },
            { name: "name", type: "string", description: "User name (used for initials fallback)" },
            {
                name: "size",
                type: "'sm' | 'md' | 'lg'",
                default: "'md'",
                description: "Avatar size",
            },
        ],
        outputs: [],
        usageExample: `<app-avatar name="John Doe" size="md"></app-avatar>`,
    },

    {
        className: "AppBadgeComponent",
        selector: "app-badge",
        importPath: "@shared/components/badge",
        description:
            "A small label/badge for status indicators or counts.",
        inputs: [
            { name: "text", type: "string", description: "Badge text" },
            {
                name: "color",
                type: "'primary' | 'success' | 'warning' | 'danger' | 'neutral'",
                default: "'primary'",
                description: "Badge color variant",
            },
        ],
        outputs: [],
        usageExample: `<app-badge text="New" color="success"></app-badge>`,
    },
];

// ─── Helpers ────────────────────────────────────────────────

/**
 * Builds a concise prompt-friendly description of all registered components.
 */
export function buildComponentRegistryPrompt(): string {
    const lines = [
        "## Available Custom Components",
        "",
        "You MUST use these components instead of raw HTML elements whenever appropriate.",
        "Import them from their respective paths.",
        "",
    ];

    for (const comp of COMPONENT_REGISTRY) {
        lines.push(`### \`<${comp.selector}>\` — ${comp.description}`);
        lines.push(`**Import**: \`import { ${comp.className} } from '${comp.importPath}';\``);

        if (comp.inputs.length > 0) {
            lines.push("**Inputs**:");
            for (const input of comp.inputs) {
                const def = input.default ? ` (default: ${input.default})` : "";
                lines.push(`  - \`[${input.name}]: ${input.type}\` — ${input.description}${def}`);
            }
        }

        if (comp.outputs.length > 0) {
            lines.push("**Outputs**:");
            for (const output of comp.outputs) {
                lines.push(`  - \`(${output.name}): ${output.type}\` — ${output.description}`);
            }
        }

        lines.push(`**Example**:\n\`\`\`html\n${comp.usageExample}\n\`\`\``);
        lines.push("");
    }

    return lines.join("\n");
}
