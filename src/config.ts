import dotenv from "dotenv";

dotenv.config();

export interface AppConfig {
  figmaToken: string;
}

export function loadConfig(): AppConfig {
  const figmaToken = process.env.FIGMA_TOKEN?.trim();

  if (!figmaToken) {
    throw new Error("Missing FIGMA_TOKEN. Add it in your environment or .env file.");
  }

  return {
    figmaToken,
  };
}
