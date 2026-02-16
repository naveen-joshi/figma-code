import { GoogleGenAI } from "@google/genai";

export class AIClient {
    private client: GoogleGenAI;

    constructor(apiKey: string) {
        this.client = new GoogleGenAI({ apiKey });
    }

    async generateContent(prompt: string): Promise<string> {
        const response = await this.client.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        const candidate = response.candidates?.[0];
        if (!candidate) {
            throw new Error("No response candidates from Gemini.");
        }

        const part = candidate.content?.parts?.[0];
        if (!part || !part.text) {
            throw new Error("Empty response from Gemini.");
        }

        return part.text;
    }
}
