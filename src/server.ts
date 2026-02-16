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
import { FigmaPipeline } from "./pipeline.js";
import { designSystemToCSS, designSystemToSCSS } from "./design-system.js";

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
            const { figmaUrl, figmaToken, nodeId, screenName, useAI } = req.body as {
                figmaUrl: string;
                figmaToken: string;
                nodeId?: string;
                screenName?: string;
                useAI?: boolean;
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

            const tmpOut = path.join(__dirname, "..", ".generated");
            const pipeline = new FigmaPipeline(figmaUrl, figmaToken);
            const generated = await pipeline.generate({
                screenName,
                nodeId,
                outputRoot: tmpOut,
                useAI: !!useAI,
                apiKey: key,
            });

            // Read files back to return content
            const [html, scss, ts] = await Promise.all([
                readFile(generated.htmlPath, "utf8"),
                readFile(generated.scssPath, "utf8"),
                readFile(generated.tsPath, "utf8"),
            ]);

            res.json({
                componentName: generated.componentName,
                files: { html, scss, ts },
            });
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
            const { json, screenName, useAI } = req.body as {
                json: string;
                screenName: string;
                useAI?: boolean;
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

                const generated = await generateAngularScreenWithAI(normalized, tmpOut, key);
                const [html, scss, ts] = await Promise.all([
                    readFile(generated.htmlPath, "utf8"),
                    readFile(generated.scssPath, "utf8"),
                    readFile(generated.tsPath, "utf8"),
                ]);

                res.json({ componentName: generated.componentName, files: { html, scss, ts } });
            } else {
                const generated = await generateAngularScreen(normalized, { outputRoot: tmpOut });
                const [html, scss, ts] = await Promise.all([
                    readFile(generated.htmlPath, "utf8"),
                    readFile(generated.scssPath, "utf8"),
                    readFile(generated.tsPath, "utf8"),
                ]);

                res.json({ componentName: generated.componentName, files: { html, scss, ts } });
            }
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
        console.log(`\n  🚀 Figma-to-Angular Generator`);
        console.log(`  ────────────────────────────────`);
        console.log(`  Web UI:  http://localhost:${port}`);
        console.log(`  API:     http://localhost:${port}/api/generate`);
        console.log(`  Press Ctrl+C to stop.\n`);
    });

    return app;
}
