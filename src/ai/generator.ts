import path from "node:path";
import { promises as fs } from "node:fs";
import { NormalizedScreen } from "../types.js";
import { AIClient } from "./client.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.js";
import { toKebabCase, toPascalCase } from "../utils.js";

interface GeneratedFiles {
    componentName: string;
    componentDir: string;
    htmlPath: string;
    scssPath: string;
    tsPath: string;
}

interface AIResponse {
    html: string;
    scss: string;
    ts: string;
}

export async function generateAngularScreenWithAI(
    screen: NormalizedScreen,
    outputRoot: string,
    apiKey: string
): Promise<GeneratedFiles> {
    const client = new AIClient(apiKey);
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(screen);

    console.log("Generating code with Gemini...");
    const rawResponse = await client.generateContent(`${systemPrompt}\n\n${userPrompt}`);

    // Clean up code blocks if present (despite instructions)
    const cleanJson = rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();

    let result: AIResponse;
    try {
        result = JSON.parse(cleanJson);
    } catch (err) {
        throw new Error(`Failed to parse AI response: ${err}\nResponse was: ${cleanJson}`);
    }

    const componentName = toKebabCase(screen.name);
    const componentDir = path.join(outputRoot, "src", "app", "pages", componentName);

    await fs.mkdir(componentDir, { recursive: true });

    const htmlPath = path.join(componentDir, `${componentName}.component.html`);
    const scssPath = path.join(componentDir, `${componentName}.component.scss`);
    const tsPath = path.join(componentDir, `${componentName}.component.ts`);

    // Ensure TS code has the correct selector and template URLs
    const selector = `app-${componentName}`;
    const modifiedTs = result.ts
        .replace(/selector: ['"].*['"]/, `selector: '${selector}'`)
        .replace(/template: [`'"].*[`'"]/, `templateUrl: './${componentName}.component.html'`) // Handle inline template case
        .replace(/styles: \[[`'"].*[`'"]\]/, `styleUrl: './${componentName}.component.scss'`) // Handle inline styles case
        .replace(/templateUrl: ['"].*['"]/, `templateUrl: './${componentName}.component.html'`)
        .replace(/styleUrls?: \[[^\]]*\]/, `styleUrl: './${componentName}.component.scss'`)
        .replace(/export class \w+/, `export class ${toPascalCase(componentName)}Component`);

    await Promise.all([
        fs.writeFile(htmlPath, result.html, "utf8"),
        fs.writeFile(scssPath, result.scss, "utf8"),
        fs.writeFile(tsPath, modifiedTs, "utf8"),
    ]);

    return {
        componentName,
        componentDir,
        htmlPath,
        scssPath,
        tsPath,
    };
}
