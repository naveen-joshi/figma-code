import { readFile } from "node:fs/promises";

import { loadConfig } from "./config.js";
import {
  extractFileKey,
  FigmaClient,
  findNodeByName,
  listTopLevelFrameNames,
  parseFigmaRootFromJsonPayload,
} from "./figma-api.js";
import { normalizeScreen } from "./normalize.js";
import { generateAngularScreen } from "./angular-generator.js";
import { generateAngularScreenWithAI } from "./ai/generator.js";
import { createServer } from "./server.js";
import { FigmaPipeline } from "./pipeline.js";

interface CliArgs {
  file?: string;
  json?: string;
  screen?: string;
  out?: string;
  ai?: boolean;
  apiKey?: string;
  serve?: boolean;
  port?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--file") {
      args.file = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === "--screen") {
      args.screen = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === "--json") {
      args.json = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === "--out") {
      args.out = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === "--ai") {
      args.ai = true;
      continue;
    }

    if (token === "--api-key") {
      args.apiKey = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === "--serve") {
      args.serve = true;
      continue;
    }

    if (token === "--port") {
      args.port = parseInt(argv[i + 1], 10);
      i += 1;
    }
  }

  return args;
}

function assertArgs(args: CliArgs): asserts args is { file?: string; json?: string; screen: string; out: string; ai?: boolean; apiKey?: string; serve?: boolean; port?: number } {
  // In serve mode, screen/file/json are not required
  if (args.serve) {
    return;
  }

  if (!args.screen) {
    throw new Error(
      "Missing required args. Usage: --screen <screen-name> [--file <figma-file-url-or-key> | --json <figma-json-file>] [--out <angular-project-path>]",
    );
  }

  if (!args.file && !args.json) {
    throw new Error("Provide one input source: --file <figma-file-url-or-key> or --json <figma-json-file>.");
  }

  if (args.file && args.json) {
    throw new Error("Use only one input source at a time: either --file or --json.");
  }

  if (!args.out) {
    args.out = process.cwd();
  }

  if (args.ai && !args.apiKey && !process.env.GEMINI_API_KEY) {
    throw new Error("Missing API Key. Provide --api-key or set GEMINI_API_KEY env var when using --ai.");
  }
}

async function run(): Promise<void> {
  const cliArgs = parseArgs(process.argv.slice(2));
  assertArgs(cliArgs);

  // Web server mode
  if (cliArgs.serve) {
    const port = cliArgs.port || 3000;
    const key = cliArgs.apiKey || process.env.GEMINI_API_KEY;
    createServer(port, key);
    return;
  }

  // ─── Figma API Pipeline mode (--file) ──────────────
  if (cliArgs.file) {
    const config = loadConfig();
    const apiKey = cliArgs.apiKey || process.env.GEMINI_API_KEY;

    console.log("  🔗 Connecting to Figma API...");
    const pipeline = new FigmaPipeline(cliArgs.file, config.figmaToken);

    // Step 1: Fetch file and list screens
    const fileResult = await pipeline.fetchFile();
    console.log(`  📁 File: ${fileResult.fileName} (${fileResult.screens.length} screens)`);
    console.log(`     Available screens: ${fileResult.screens.map(s => s.name).join(", ")}`);

    // Step 2: Find the requested screen
    const targetScreen = fileResult.screens.find(
      s => s.name.toLowerCase() === cliArgs.screen.toLowerCase()
    );
    if (!targetScreen) {
      throw new Error(
        `Screen "${cliArgs.screen}" not found. Available: ${fileResult.screens.map(s => s.name).join(", ")}`
      );
    }

    // Step 3: Screenshot
    console.log(`  📸 Exporting screenshot of "${targetScreen.name}"...`);
    try {
      const screenshot = await pipeline.fetchScreenshot(targetScreen.id);
      if (screenshot.url) {
        console.log(`     Screenshot URL: ${screenshot.url}`);
      }
    } catch {
      console.log("     Screenshot export skipped (non-blocking).");
    }

    // Step 4: Generate via pipeline
    console.log(`  ⚙️  Generating Angular component...`);
    const generated = await pipeline.generate({
      nodeId: targetScreen.id,
      screenName: cliArgs.screen,
      outputRoot: cliArgs.out,
      useAI: !!cliArgs.ai,
      apiKey,
    });

    console.log("\n  ✅ Component generated successfully!");
    console.log(`  Component: ${generated.componentName}`);
    console.log(`  Files:\n   - ${generated.tsPath}\n   - ${generated.htmlPath}\n   - ${generated.scssPath}`);
    return;
  }

  // ─── Offline JSON mode (--json) ────────────────────
  const raw = await readFile(cliArgs.json!, "utf8");

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Invalid JSON file: ${cliArgs.json}`);
  }

  const root = parseFigmaRootFromJsonPayload(payload);
  const screen = findNodeByName(root, cliArgs.screen);
  if (!screen) {
    const suggestions = listTopLevelFrameNames(root);
    const help = suggestions.length > 0 ? `Available top-level frames/components: ${suggestions.join(", ")}` : "No top-level frames found.";
    throw new Error(`Screen '${cliArgs.screen}' not found in Figma file. ${help}`);
  }

  const normalized = normalizeScreen(screen);

  if (cliArgs.ai) {
    console.log("Interactive AI Mode enabled.");
    const apiKey = cliArgs.apiKey || process.env.GEMINI_API_KEY!;
    const generated = await generateAngularScreenWithAI(normalized, cliArgs.out, apiKey);

    console.log("AI-Enhanced Angular component generated successfully.");
    console.log(`Component: ${generated.componentName}`);
    console.log(`Output directory: ${generated.componentDir}`);
    console.log(`Files:\n - ${generated.tsPath}\n - ${generated.htmlPath}\n - ${generated.scssPath}`);
    return;
  }

  const generated = await generateAngularScreen(normalized, {
    outputRoot: cliArgs.out,
  });

  console.log("Angular component generated successfully.");
  console.log(`Component: ${generated.componentName}`);
  console.log(`Output directory: ${generated.componentDir}`);
  console.log(`Files:\n - ${generated.tsPath}\n - ${generated.htmlPath}\n - ${generated.scssPath}`);
  console.log(`Design tokens: ${generated.tokenPath}`);
  console.log(`Preview report: ${generated.previewReportPath}`);

  if (generated.sharedComponents.length > 0) {
    console.log(`Shared components generated: ${generated.sharedComponents.length}`);
    generated.sharedComponents.forEach((component) => {
      console.log(` - ${component.componentName} (occurrences: ${component.occurrences})`);
      console.log(`   ${component.tsPath}`);
    });
  } else {
    console.log("Shared components generated: 0");
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Generation failed: ${message}`);
  process.exitCode = 1;
});
