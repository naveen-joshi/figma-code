import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
    FigmaClient,
    FigmaFileResponse,
    FigmaNode,
    extractFileKey,
    extractNodeId,
    listTopLevelFrameNames,
    findNodeByName,
} from "./figma-api.js";
import { normalizeScreen } from "./normalize.js";
import { resolveVariablesToTokens, tokensToScss, ResolvedDesignTokens } from "./figma-variables.js";
import { generateAngularScreenWithAI } from "./ai/generator.js";
import { generateAngularScreen } from "./angular-generator.js";
import { extractDesignSystem, DesignSystem, designSystemToCSS, designSystemToSCSS } from "./design-system.js";

// ─── Pipeline Result Types ──────────────────────────────────

export interface PipelineScreenInfo {
    name: string;
    id: string;
}

export interface PipelineFileResult {
    fileName: string;
    lastModified: string;
    thumbnailUrl: string;
    screens: PipelineScreenInfo[];
}

export interface PipelineScreenshotResult {
    nodeId: string;
    url: string | null;
}

export interface PipelineGenerateResult {
    componentName: string;
    htmlPath: string;
    scssPath: string;
    tsPath: string;
}

// ─── Pipeline Class ─────────────────────────────────────────

export class FigmaPipeline {
    private client: FigmaClient;
    private fileKey: string;
    private fileResponse?: FigmaFileResponse;

    constructor(figmaUrlOrKey: string, figmaToken: string) {
        this.fileKey = extractFileKey(figmaUrlOrKey);
        this.client = new FigmaClient(figmaToken);
    }

    /** Step 1: Fetch file metadata and list available screens */
    async fetchFile(): Promise<PipelineFileResult> {
        // depth=2 gives us pages and their top-level children (frames)
        this.fileResponse = await this.client.getFile(this.fileKey, { depth: 2 });

        const screens: PipelineScreenInfo[] = [];
        if (this.fileResponse.document.children) {
            for (const page of this.fileResponse.document.children) {
                for (const child of page.children ?? []) {
                    if (child.type === "FRAME" || child.type === "COMPONENT") {
                        screens.push({
                            name: child.name ?? "Unnamed Frame",
                            id: child.id,
                        });
                    }
                }
            }
        }

        return {
            fileName: this.fileResponse.name,
            lastModified: this.fileResponse.lastModified,
            thumbnailUrl: this.fileResponse.thumbnailUrl,
            screens,
        };
    }

    /** Step 2: Fetch a specific node's full subtree */
    async fetchNode(nodeId: string): Promise<FigmaNode> {
        const response = await this.client.getFileNodes(this.fileKey, [nodeId]);
        const entry = response.nodes[nodeId];

        if (!entry) {
            throw new Error(`Node ${nodeId} not found in file ${this.fileKey}.`);
        }

        return entry.document;
    }

    /** Step 3: Get a rendered screenshot of a node */
    async fetchScreenshot(nodeId: string, format: "png" | "svg" = "png"): Promise<PipelineScreenshotResult> {
        const response = await this.client.getImages(this.fileKey, [nodeId], {
            format,
            scale: 2,
        });

        if (response.err) {
            throw new Error(`Image export failed: ${response.err}`);
        }

        return {
            nodeId,
            url: response.images[nodeId] ?? null,
        };
    }

    /** Step 4: Fetch design variables and convert to tokens */
    async fetchVariables(): Promise<ResolvedDesignTokens | null> {
        try {
            const response = await this.client.getLocalVariables(this.fileKey);
            return resolveVariablesToTokens(response);
        } catch (err) {
            // Variables API is Enterprise-only, gracefully degrade
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("403") || msg.includes("scope") || msg.includes("plan")) {
                console.warn("⚠ Variables API not available (requires Enterprise plan). Using extracted tokens instead.");
                return null;
            }
            throw err;
        }
    }

    /** Step 5: Write variable tokens to SCSS file */
    async writeTokens(tokens: ResolvedDesignTokens, outputRoot: string): Promise<string> {
        const tokensPath = path.join(outputRoot, "src", "styles", "_figma-variables.scss");
        await mkdir(path.dirname(tokensPath), { recursive: true });
        await writeFile(tokensPath, tokensToScss(tokens), "utf8");
        return tokensPath;
    }

    /** Step 6: Full pipeline — fetch, normalize, generate */
    async generate(opts: {
        screenName?: string;
        nodeId?: string;
        outputRoot: string;
        useAI: boolean;
        apiKey?: string;
    }): Promise<PipelineGenerateResult> {
        // Resolve the target node
        let targetNode: FigmaNode;

        if (opts.nodeId) {
            targetNode = await this.fetchNode(opts.nodeId);
        } else if (opts.screenName) {
            // Need full file for name lookup
            if (!this.fileResponse) {
                this.fileResponse = await this.client.getFile(this.fileKey);
            }
            const found = findNodeByName(this.fileResponse.document, opts.screenName);
            if (!found) {
                const available = listTopLevelFrameNames(this.fileResponse.document);
                throw new Error(
                    `Screen "${opts.screenName}" not found. Available screens:\n  - ${available.join("\n  - ")}`
                );
            }
            // Re-fetch the full subtree for this specific node
            targetNode = await this.fetchNode(found.id);
        } else {
            throw new Error("Either screenName or nodeId is required.");
        }

        // Try fetching variables (non-blocking)
        const tokens = await this.fetchVariables();
        if (tokens) {
            await this.writeTokens(tokens, opts.outputRoot);
        }

        // Normalize and generate
        const normalized = normalizeScreen(targetNode);

        if (opts.useAI) {
            if (!opts.apiKey) {
                throw new Error("AI mode requires a Gemini API key (--api-key or GEMINI_API_KEY env var).");
            }
            return generateAngularScreenWithAI(normalized, opts.outputRoot, opts.apiKey);
        }

        return generateAngularScreen(normalized, { outputRoot: opts.outputRoot });
    }

    /** Fetch the complete design system (colors, typography, spacing, etc.) */
    async fetchDesignSystem(): Promise<DesignSystem> {
        return extractDesignSystem(this.client, this.fileKey);
    }

    /** Write the design system as a CSS file */
    async writeDesignSystemCSS(system: DesignSystem, outputRoot: string): Promise<string> {
        const outPath = path.join(outputRoot, "src", "styles", "_design-system.css");
        await mkdir(path.dirname(outPath), { recursive: true });
        const css = designSystemToCSS(system);
        const { writeFile: wf } = await import("node:fs/promises");
        await wf(outPath, css, "utf8");
        return outPath;
    }

    /** Write the design system as a SCSS file */
    async writeDesignSystemSCSS(system: DesignSystem, outputRoot: string): Promise<string> {
        const outPath = path.join(outputRoot, "src", "styles", "_design-system.scss");
        await mkdir(path.dirname(outPath), { recursive: true });
        const scss = designSystemToSCSS(system);
        const { writeFile: wf } = await import("node:fs/promises");
        await wf(outPath, scss, "utf8");
        return outPath;
    }
}
