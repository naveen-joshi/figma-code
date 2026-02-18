import path from "node:path";
import { promises as fs } from "node:fs";
import { NormalizedScreen } from "../types.js";
import { AIClient } from "./client.js";
import { buildReactSystemPrompt, buildReactUserPrompt } from "./react-prompts.js";
import { toKebabCase, toPascalCase } from "../utils.js";

interface GeneratedReactFiles {
    componentName: string;
    componentDir: string;
    tsxPath: string;
    cssPath: string;
}

interface AIReactResponse {
    tsx: string;
    css: string;
}

export async function generateReactScreenWithAI(
    screen: NormalizedScreen,
    outputRoot: string,
    apiKey: string,
): Promise<GeneratedReactFiles> {
    const client = new AIClient(apiKey);
    const systemPrompt = buildReactSystemPrompt();
    const userPrompt = buildReactUserPrompt(screen);

    console.log("Generating React code with Gemini...");
    const rawResponse = await client.generateContent(`${systemPrompt}\n\n${userPrompt}`);

    // Clean up code blocks if present
    const cleanJson = rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();

    let result: AIReactResponse;
    try {
        result = JSON.parse(cleanJson);
    } catch (err) {
        throw new Error(`Failed to parse AI response: ${err}\nResponse was: ${cleanJson}`);
    }

    const componentName = toKebabCase(screen.name);
    const pascalName = toPascalCase(componentName);
    const componentDir = path.join(outputRoot, "src", "components", "pages", componentName);

    await fs.mkdir(componentDir, { recursive: true });

    const tsxPath = path.join(componentDir, `${pascalName}.tsx`);
    const cssPath = path.join(componentDir, `${pascalName}.module.css`);

    // Fix up component name and imports in the TSX
    const modifiedTsx = result.tsx
        .replace(/export default function \w+/,
            `export default function ${pascalName}`)
        .replace(/export function \w+/,
            `export default function ${pascalName}`);

    await Promise.all([
        fs.writeFile(tsxPath, modifiedTsx, "utf8"),
        fs.writeFile(cssPath, result.css, "utf8"),
    ]);

    return {
        componentName,
        componentDir,
        tsxPath,
        cssPath,
    };
}
