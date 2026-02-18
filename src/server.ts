import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import {
    parseFigmaRootFromJsonPayload,
    findNodeByName,
    listTopLevelFrameNames,
} from "./figma-api.js";
import { normalizeScreen } from "./normalize.js";
import { generateAngularScreen } from "./angular-generator.js";
import { generateAngularScreenWithAI } from "./ai/generator.js";
import { generateReactScreen } from "./react-generator.js";
import { generateReactScreenWithAI } from "./ai/react-generator.js";
import { FigmaPipeline, Framework } from "./pipeline.js";
import { designSystemToCSS, designSystemToSCSS } from "./design-system.js";
import { AIClient } from "./ai/client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer(port: number, apiKey?: string) {
    const app = express();

    app.use(express.json({ limit: "10mb" }));

    // Serve static frontend files
    const webDir = path.join(__dirname, "..", "src", "web");
    app.use(express.static(webDir));

    // ═══════════════════════════════════════════════════════
    //  Figma API Pipeline Routes (no MCP needed)
    // ═══════════════════════════════════════════════════════

    /** Step 1: Fetch file from Figma API and return screen list */
    app.post("/api/fetch-file", async (req, res) => {
        try {
            const { figmaUrl, figmaToken } = req.body as {
                figmaUrl: string;
                figmaToken: string;
            };

            if (!figmaUrl || !figmaToken) {
                res.status(400).json({ error: "Missing 'figmaUrl' or 'figmaToken'." });
                return;
            }

            const pipeline = new FigmaPipeline(figmaUrl, figmaToken);
            const result = await pipeline.fetchFile();
            res.json(result);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: msg });
        }
    });

    /** Step 2: Fetch a specific node's full subtree */
    app.post("/api/fetch-node", async (req, res) => {
        try {
            const { figmaUrl, figmaToken, nodeId } = req.body as {
                figmaUrl: string;
                figmaToken: string;
                nodeId: string;
            };

            if (!figmaUrl || !figmaToken || !nodeId) {
                res.status(400).json({ error: "Missing 'figmaUrl', 'figmaToken', or 'nodeId'." });
                return;
            }

            const pipeline = new FigmaPipeline(figmaUrl, figmaToken);
            const node = await pipeline.fetchNode(nodeId);
            res.json({ node });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: msg });
        }
    });

    /** Step 3: Get rendered screenshot of a node */
    app.post("/api/screenshot", async (req, res) => {
        try {
            const { figmaUrl, figmaToken, nodeId } = req.body as {
                figmaUrl: string;
                figmaToken: string;
                nodeId: string;
            };

            if (!figmaUrl || !figmaToken || !nodeId) {
                res.status(400).json({ error: "Missing 'figmaUrl', 'figmaToken', or 'nodeId'." });
                return;
            }

            const pipeline = new FigmaPipeline(figmaUrl, figmaToken);
            const result = await pipeline.fetchScreenshot(nodeId);
            res.json(result);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: msg });
        }
    });

    /** Step 4: Fetch design variables */
    app.post("/api/variables", async (req, res) => {
        try {
            const { figmaUrl, figmaToken } = req.body as {
                figmaUrl: string;
                figmaToken: string;
            };

            if (!figmaUrl || !figmaToken) {
                res.status(400).json({ error: "Missing 'figmaUrl' or 'figmaToken'." });
                return;
            }

            const pipeline = new FigmaPipeline(figmaUrl, figmaToken);
            const tokens = await pipeline.fetchVariables();
            res.json({ tokens, available: tokens !== null });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: msg });
        }
    });

    /** Full pipeline: Figma URL → generated code */
    app.post("/api/generate-from-figma", async (req, res) => {
        try {
            const { figmaUrl, figmaToken, nodeId, screenName, useAI, framework } = req.body as {
                figmaUrl: string;
                figmaToken: string;
                nodeId?: string;
                screenName?: string;
                useAI?: boolean;
                framework?: Framework;
            };

            if (!figmaUrl || !figmaToken) {
                res.status(400).json({ error: "Missing 'figmaUrl' or 'figmaToken'." });
                return;
            }

            if (!nodeId && !screenName) {
                res.status(400).json({ error: "Provide either 'nodeId' or 'screenName'." });
                return;
            }

            const key = apiKey || process.env.GEMINI_API_KEY;
            if (useAI && !key) {
                res.status(400).json({ error: "AI mode requires GEMINI_API_KEY." });
                return;
            }

            const fw: Framework = framework ?? "angular";
            const tmpOut = path.join(__dirname, "..", ".generated");
            const pipeline = new FigmaPipeline(figmaUrl, figmaToken);
            const generated = await pipeline.generate({
                screenName,
                nodeId,
                outputRoot: tmpOut,
                useAI: !!useAI,
                apiKey: key,
                framework: fw,
            });

            // Read files back to return content based on framework
            if (fw === "react") {
                const [tsx, css] = await Promise.all([
                    readFile(generated.tsxPath!, "utf8"),
                    readFile(generated.cssPath!, "utf8"),
                ]);
                res.json({ componentName: generated.componentName, framework: fw, files: { tsx, css } });
            } else {
                const [html, scss, ts] = await Promise.all([
                    readFile(generated.htmlPath!, "utf8"),
                    readFile(generated.scssPath!, "utf8"),
                    readFile(generated.tsPath!, "utf8"),
                ]);
                res.json({ componentName: generated.componentName, framework: fw, files: { html, scss, ts } });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: msg });
        }
    });

    /** Step 6: Extract design system (typography, colors, variables) */
    app.post("/api/design-system", async (req, res) => {
        try {
            const { figmaUrl, figmaToken, format } = req.body as {
                figmaUrl: string;
                figmaToken: string;
                format?: "css" | "scss";
            };

            if (!figmaUrl || !figmaToken) {
                res.status(400).json({ error: "Missing 'figmaUrl' or 'figmaToken'." });
                return;
            }

            const pipeline = new FigmaPipeline(figmaUrl, figmaToken);
            const system = await pipeline.fetchDesignSystem();

            const cssContent = format === "scss"
                ? designSystemToSCSS(system)
                : designSystemToCSS(system);

            res.json({
                designSystem: system,
                cssContent,
                format: format ?? "css",
                stats: {
                    colors: system.colors.length,
                    typography: system.typography.length,
                    spacing: system.spacing.length,
                    radii: system.radii.length,
                    shadows: system.shadows.length,
                    source: system.source,
                },
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: msg });
        }
    });

    // ═══════════════════════════════════════════════════════
    //  Legacy JSON Routes (paste/upload mode)
    // ═══════════════════════════════════════════════════════

    /** List screens from pasted JSON */
    app.post("/api/screens", (req, res) => {
        try {
            const { json } = req.body as { json: string };
            if (!json) {
                res.status(400).json({ error: "Missing 'json' field." });
                return;
            }

            let payload: unknown;
            try {
                payload = JSON.parse(json) as unknown;
            } catch {
                res.status(400).json({ error: "Invalid JSON." });
                return;
            }

            const root = parseFigmaRootFromJsonPayload(payload);
            const screens = listTopLevelFrameNames(root);
            res.json({ screens });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: msg });
        }
    });

    /** Generate from pasted JSON */
    app.post("/api/generate", async (req, res) => {
        try {
            const { json, screenName, useAI, framework } = req.body as {
                json: string;
                screenName: string;
                useAI?: boolean;
                framework?: Framework;
            };

            if (!json || !screenName) {
                res.status(400).json({ error: "Missing 'json' or 'screenName'." });
                return;
            }

            let payload: unknown;
            try {
                payload = JSON.parse(json) as unknown;
            } catch {
                res.status(400).json({ error: "Invalid JSON." });
                return;
            }

            const root = parseFigmaRootFromJsonPayload(payload);
            const screen = findNodeByName(root, screenName);

            if (!screen) {
                const suggestions = listTopLevelFrameNames(root);
                res.status(404).json({
                    error: `Screen '${screenName}' not found.`,
                    available: suggestions,
                });
                return;
            }

            const fw: Framework = framework ?? "angular";
            const normalized = normalizeScreen(screen);
            const tmpOut = path.join(__dirname, "..", ".generated");

            if (useAI) {
                const key = apiKey || process.env.GEMINI_API_KEY;
                if (!key) {
                    res.status(400).json({
                        error: "AI mode requires GEMINI_API_KEY env var or --api-key flag.",
                    });
                    return;
                }

                if (fw === "react") {
                    const generated = await generateReactScreenWithAI(normalized, tmpOut, key);
                    const [tsx, css] = await Promise.all([
                        readFile(generated.tsxPath, "utf8"),
                        readFile(generated.cssPath, "utf8"),
                    ]);
                    res.json({ componentName: generated.componentName, framework: fw, files: { tsx, css } });
                } else {
                    const generated = await generateAngularScreenWithAI(normalized, tmpOut, key);
                    const [html, scss, ts] = await Promise.all([
                        readFile(generated.htmlPath, "utf8"),
                        readFile(generated.scssPath, "utf8"),
                        readFile(generated.tsPath, "utf8"),
                    ]);
                    res.json({ componentName: generated.componentName, framework: fw, files: { html, scss, ts } });
                }
            } else {
                if (fw === "react") {
                    const generated = await generateReactScreen(normalized, { outputRoot: tmpOut });
                    const [tsx, css] = await Promise.all([
                        readFile(generated.tsxPath, "utf8"),
                        readFile(generated.cssPath, "utf8"),
                    ]);
                    res.json({ componentName: generated.componentName, framework: fw, files: { tsx, css } });
                } else {
                    const generated = await generateAngularScreen(normalized, { outputRoot: tmpOut });
                    const [html, scss, ts] = await Promise.all([
                        readFile(generated.htmlPath, "utf8"),
                        readFile(generated.scssPath, "utf8"),
                        readFile(generated.tsPath, "utf8"),
                    ]);
                    res.json({ componentName: generated.componentName, framework: fw, files: { html, scss, ts } });
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: msg });
        }
    });

    /** Iterate on generated code using AI */
    app.post("/api/iterate", async (req, res) => {
        try {
            const { files, framework, prompt } = req.body as {
                files: Record<string, string>;
                framework: Framework;
                prompt: string;
            };

            if (!files || !prompt) {
                res.status(400).json({ error: "Missing 'files' or 'prompt'." });
                return;
            }

            const key = apiKey || process.env.GEMINI_API_KEY;
            if (!key) {
                res.status(400).json({ error: "AI iteration requires GEMINI_API_KEY." });
                return;
            }

            const fw = framework ?? "angular";
            const client = new AIClient(key);

            let iteratePrompt: string;
            if (fw === "react") {
                iteratePrompt = [
                    "You are an expert React developer. The user has generated a React component and wants to refine it.",
                    "",
                    "Current TSX:",
                    "```tsx",
                    files.tsx || "",
                    "```",
                    "",
                    "Current CSS Module:",
                    "```css",
                    files.css || "",
                    "```",
                    "",
                    `User's request: ${prompt}`,
                    "",
                    "Return the updated code as a JSON object with keys: \"tsx\", \"css\".",
                    "Do not include markdown code blocks — just raw JSON.",
                ].join("\n");
            } else {
                iteratePrompt = [
                    "You are an expert Angular developer. The user has generated an Angular component and wants to refine it.",
                    "",
                    "Current HTML:",
                    "```html",
                    files.html || "",
                    "```",
                    "",
                    "Current SCSS:",
                    "```scss",
                    files.scss || "",
                    "```",
                    "",
                    "Current TypeScript:",
                    "```typescript",
                    files.ts || "",
                    "```",
                    "",
                    `User's request: ${prompt}`,
                    "",
                    "Return the updated code as a JSON object with keys: \"html\", \"scss\", \"ts\".",
                    "Do not include markdown code blocks — just raw JSON.",
                ].join("\n");
            }

            const rawResponse = await client.generateContent(iteratePrompt);
            const cleanJson = rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();

            let result: Record<string, string>;
            try {
                result = JSON.parse(cleanJson);
            } catch {
                throw new Error(`Failed to parse AI iteration response.`);
            }

            res.json({ files: result, framework: fw });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: msg });
        }
    });

    // ─── Fallback to index.html ───────────────────────────
    app.get("/{*path}", (_req, res) => {
        res.sendFile(path.join(webDir, "index.html"));
    });

    app.listen(port, () => {
        console.log(`\n  🚀 Figma-to-Code Generator`);
        console.log(`  ────────────────────────────────`);
        console.log(`  Web UI:  http://localhost:${port}`);
        console.log(`  API:     http://localhost:${port}/api/generate`);
        console.log(`  Frameworks: Angular, React`);
        console.log(`  Press Ctrl+C to stop.\n`);
    });

    return app;
}
