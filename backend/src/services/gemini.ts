import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiNoteResponseSchema, type GeminiNoteResponse } from "../schemas/zod";
import type { Difficulty } from "../models/Note";

const DEFAULT_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
];

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? DEFAULT_MODELS[0];
const GEMINI_TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS ?? "30000", 10);

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ─── Prompt Injection Sanitizer ───────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore (all |previous |above |prior )?instructions?/gi,
  /system\s*:/gi,
  /\[INST\]/gi,
  /<\/?s>/gi,
  /\bprompt\s*injection\b/gi,
  /<script[\s\S]*?>/gi,
  /javascript:/gi,
  /data:text\/html/gi,
  /\{%[\s\S]*?%\}/g,
  /\{\{[\s\S]*?\}\}/g,
];

export function sanitizeTopic(raw: string): string {
  let topic = raw.trim().slice(0, 200);
  // Strip potential injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    topic = topic.replace(pattern, "");
  }
  // Remove control characters and excessive whitespace
  topic = topic.replace(/[\x00-\x1F\x7F]/g, "").replace(/\s+/g, " ").trim();
  return topic;
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildPrompt(topic: string, difficulty: Difficulty): string {
  const difficultyGuide = {
    easy: "Use simple language, fundamental concepts, and basic examples suitable for beginners.",
    medium: "Cover core concepts with moderate depth, include practical examples and edge cases.",
    hard: "Go into advanced depth, cover edge cases, tradeoffs, and expert-level nuances.",
  }[difficulty];

  return `You are an expert academic tutor generating structured exam notes.

TOPIC: ${topic}
DIFFICULTY: ${difficulty} — ${difficultyGuide}

Generate comprehensive exam notes and return ONLY a valid JSON object (no markdown fences, no extra text) matching this exact schema:

{
  "content": "<markdown string, 200-2000 words, use ## for h2, ### for h3, **bold**, \`code\`, bullet lists, and ONE markdown table>",
  "diagrams": [
    {
      "id": "diag_1",
      "type": "mermaid",
      "title": "<diagram title>",
      "data": "<valid mermaid diagram string>"
    },
    {
      "id": "diag_2",
      "type": "recharts_bar",
      "title": "<chart title>",
      "data": {
        "keys": ["value"],
        "values": [{ "name": "Label", "value": 42 }]
      }
    }
  ],
  "questions": [
    {
      "id": "q_1",
      "question": "<exam-style question>",
      "answer": "<comprehensive answer, 2-5 sentences>",
      "priority": "high",
      "tags": ["tag1", "tag2"]
    }
  ]
}

REQUIREMENTS:
- content: Valid markdown, 200-2000 words covering key concepts
- diagrams: 2-4 diagrams. Choose appropriate type for the topic: "mermaid" (for flows/state machines/architectures), "recharts_bar" (for comparisons), "recharts_pie" (for market shares/percentages), or "recharts_line" (for trends/complexity curves). For recharts, data MUST be an object of {keys: string[], values: Array<{name: string, [key]: number}>}
- questions: 5-10 questions, mix of high/medium/low priority
- Return ONLY the JSON object, nothing else`;
}

// ─── Gemini Caller with Timeout + Retry ───────────────────────────────────────

async function callWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini request timed out")), timeoutMs),
    ),
  ]);
}

export async function generateNoteContent(
  topic: string,
  difficulty: Difficulty,
  maxRetries = 2,
): Promise<GeminiNoteResponse> {
  const sanitized = sanitizeTopic(topic);
  const prompt = buildPrompt(sanitized, difficulty);

  const modelCandidates = [
    process.env.GEMINI_MODEL || DEFAULT_MODELS[0],
    ...DEFAULT_MODELS.filter((m) => m !== (process.env.GEMINI_MODEL || DEFAULT_MODELS[0])),
  ];

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const selectedModel = modelCandidates[attempt % modelCandidates.length];
    try {
      const model = genAI.getGenerativeModel({
        model: selectedModel,
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      });

      const result = await callWithTimeout(
        () => model.generateContent(prompt),
        GEMINI_TIMEOUT_MS,
      );

      const text = result.response.text().trim();

      // Strip markdown code fences if Gemini wraps output despite instructions
      const cleanedText = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleanedText);
      } catch {
        throw new Error(`Invalid JSON from Gemini (attempt ${attempt + 1}): ${cleanedText.slice(0, 200)}`);
      }

      // Validate against Zod schema — if malformed, throw so we retry
      const validated = GeminiNoteResponseSchema.parse(parsed);

      // Deep validate each diagram payload:
      const sanitizedDiagrams = validated.diagrams.map((d) => {
        if (d.type.startsWith("recharts_")) {
          let dataObj = d.data;
          if (typeof d.data === "string") {
            try {
              dataObj = JSON.parse(d.data);
            } catch {
              throw new Error(`Diagram "${d.title}" (${d.type}) contains invalid JSON string in data`);
            }
          }
          if (
            !dataObj ||
            typeof dataObj !== "object" ||
            !Array.isArray((dataObj as any).keys) ||
            !Array.isArray((dataObj as any).values) ||
            (dataObj as any).keys.length === 0 ||
            (dataObj as any).values.length === 0
          ) {
            throw new Error(`Diagram "${d.title}" (${d.type}) is missing required keys or values array`);
          }
        }
        return d;
      });

      validated.diagrams = sanitizedDiagrams;
      return validated;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Gemini] Attempt ${attempt + 1} failed: ${lastError.message}`);

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error("Gemini generation failed after retries");
}
