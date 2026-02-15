import { OpenRouter } from "@openrouter/sdk";
import {
  evaluationSystemPrompt,
  parseEvaluation,
  parseProofVerification,
  proofSystemPrompt,
} from "@forgood/agent";
import { resolveVerdict, type MissionProposal, type ProofVerification } from "@forgood/shared";

// ─── Mode & Config ──────────────────────────────────────────

export type ForGoodMode = "test" | "serving";

const FORGOOD_MODE: ForGoodMode =
  (process.env.FORGOOD_MODE as ForGoodMode) === "serving" ? "serving" : "test";

/** Model mapping per mode */
const MODEL_MAP: Record<ForGoodMode, { text: string; vision: string }> = {
  test: {
    text: process.env.OPENROUTER_MODEL_TEST ?? "openrouter/auto",
    vision: process.env.OPENROUTER_MODEL_VISION_TEST ?? "openrouter/auto",
  },
  serving: {
    text: process.env.OPENROUTER_MODEL ?? "moonshotai/kimi-k2.5",
    vision: process.env.OPENROUTER_MODEL_VISION ?? "moonshotai/kimi-k2.5",
  },
};

function getModels() {
  return MODEL_MAP[FORGOOD_MODE];
}

/** Expose current mode for logging / health-check */
export function getForGoodMode(): ForGoodMode {
  return FORGOOD_MODE;
}

export function getActiveModels() {
  const m = getModels();
  return { mode: FORGOOD_MODE, text: m.text, vision: m.vision };
}

// ─── SDK Client ─────────────────────────────────────────────

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  httpReferer: process.env.OPENROUTER_REFERER ?? "http://localhost",
  xTitle: process.env.OPENROUTER_TITLE ?? "FORGOOD",
  serverURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  retryConfig: {
    strategy: "backoff",
    backoff: { initialInterval: 1000, maxInterval: 8000, maxElapsedTime: 30_000, exponent: 2 },
    retryConnectionErrors: true,
  },
});

// ─── Types ──────────────────────────────────────────────────

type SDKMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | Array<ContentPart> }
  | { role: "assistant"; content: string };

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type UsageInfo = { promptTokens: number; completionTokens: number; totalTokens: number };

// ─── Core Streaming Call ────────────────────────────────────

/** Check if the OpenRouter API key is configured */
export function isAiAvailable(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

async function callOpenRouter(
  messages: SDKMessage[],
  modelOverride?: string,
): Promise<{ content: string; usage: UsageInfo | null }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const model = modelOverride ?? getModels().text;
  const startMs = Date.now();

  const stream = await openrouter.chat.send({
    chatGenerationParams: {
      model,
      messages: messages as Parameters<typeof openrouter.chat.send>[0]["chatGenerationParams"]["messages"],
      stream: true,
      temperature: 0.3,
      responseFormat: { type: "json_object" },
    },
  });

  let fullContent = "";
  let usage: UsageInfo | null = null;

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      fullContent += delta;
    }
    // Usage info arrives in the final chunk
    if (chunk.usage) {
      usage = {
        promptTokens: chunk.usage.promptTokens ?? 0,
        completionTokens: chunk.usage.completionTokens ?? 0,
        totalTokens: chunk.usage.totalTokens ?? 0,
      };
    }
  }

  const latencyMs = Date.now() - startMs;

  if (!fullContent) {
    throw new Error("OpenRouter response missing content");
  }

  // Log usage for cost tracking
  if (usage) {
    console.log(
      `[OpenRouter] mode=${FORGOOD_MODE} model=${model} tokens_in=${usage.promptTokens} tokens_out=${usage.completionTokens} latency=${latencyMs}ms`,
    );
  } else {
    console.log(`[OpenRouter] mode=${FORGOOD_MODE} model=${model} latency=${latencyMs}ms (no usage data)`);
  }

  return { content: fullContent, usage };
}

// ─── JSON Extraction ────────────────────────────────────────

function extractJson(content: string): unknown {
  // First try direct parse
  try {
    return JSON.parse(content);
  } catch {
    // Try to extract from markdown code fences or surrounding text
    const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    // Try to find raw JSON object
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(content.slice(start, end + 1));
    }
    throw new Error(`No valid JSON found in response: ${content.slice(0, 200)}`);
  }
}

// ─── Public API ─────────────────────────────────────────────

/** Raw call — used by agent/auto-post for mission generation */
export async function callOpenRouterRaw(
  messages: SDKMessage[],
  modelOverride?: string,
) {
  return callOpenRouter(messages, modelOverride);
}

export async function evaluateMission(mission: MissionProposal) {
  const userPrompt = [
    "Evaluate this public-good mission proposal:",
    `Title: ${mission.title}`,
    `Description: ${mission.description}`,
    `Category: ${mission.category}`,
    `Location: ${mission.location ?? "Not specified"}`,
    "",
    "Return JSON only.",
  ].join("\n");

  const { content } = await callOpenRouter([
    { role: "system", content: evaluationSystemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const parsed = extractJson(content);
  return parseEvaluation(parsed);
}

// ─── AI-Generated Content Discriminator ─────────────────────

const aiDiscriminatorPrompt = `You are an AI-generated content detector. Your ONLY job is to determine whether an uploaded image or document was generated by AI (Midjourney, DALL-E, Stable Diffusion, ChatGPT, etc.) or is a genuine real-world photograph/document.

## Analyse for these AI-generation artifacts:
1. Unnatural skin textures, merged fingers, extra limbs
2. Suspiciously perfect symmetry or lighting
3. Warped text, nonsensical signs, garbled watermarks
4. Hyper-smooth backgrounds with no natural noise/grain
5. Inconsistent shadows or reflections
6. "Plastic" or "painted" appearance typical of diffusion models
7. Perfect geometric patterns that look computer-generated
8. Stock-photo watermarks or metadata hints

## Response Format
Return ONLY a JSON object:
{
  "isAiGenerated": <boolean>,
  "confidence": <float 0.0–1.0>,
  "reasons": ["<reason 1>", "<reason 2>"]
}

## Rules
- confidence ≥ 0.75 with isAiGenerated=true → REJECT the proof
- If the file is a PDF or non-image, analyse any embedded visuals or note that text-only PDFs cannot be visually discriminated
- Be strict: the mission system rewards real-world action, not AI art`;

export interface AiDiscriminatorResult {
  isAiGenerated: boolean;
  confidence: number;
  reasons: string[];
}

export async function detectAiGenerated(proofUrl: string): Promise<AiDiscriminatorResult> {
  if (!isAiAvailable()) {
    console.warn("[AI Discriminator] OPENROUTER_API_KEY not set — skipping discrimination");
    return { isAiGenerated: false, confidence: 0, reasons: ["AI discriminator unavailable — API key not configured"] };
  }

  try {
    const { content } = await callOpenRouter(
      [
        { role: "system", content: aiDiscriminatorPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyse this uploaded proof. Is it AI-generated? Return JSON only." },
            { type: "image_url", image_url: { url: proofUrl } },
          ],
        },
      ],
      getModels().vision,
    );

    const parsed = extractJson(content) as AiDiscriminatorResult;
    return {
      isAiGenerated: Boolean(parsed.isAiGenerated),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
    };
  } catch (error) {
    console.warn("[AI Discriminator] Failed — allowing proof through:", error);
    // On failure, don't block the flow — let the main verifier handle it
    return { isAiGenerated: false, confidence: 0, reasons: ["Discriminator unavailable"] };
  }
}

// ─── Mission Proposal Social-Good Screening ─────────────────

const missionScreeningPrompt = `You are a social-good mission screening agent for the FORGOOD platform.
Your job is to evaluate whether a proposed mission genuinely contributes to social good.

## APPROVE if the mission:
1. Has clear, positive social impact (environment, education, health, community, open-source)
2. Is actionable with verifiable deliverables
3. Benefits a real community, ecosystem, or group of people
4. Is ethical and legal

## REJECT if the mission:
1. Promotes violence, hate, discrimination, or illegal activity
2. Is purely self-serving with no community benefit
3. Is spam, nonsensical, or a test post
4. Promotes scams, fraud, or deceptive practices
5. Is harmful to the environment or public health
6. Contains inappropriate or offensive content
7. Is marketing/advertising disguised as social good

## Response Format
Return ONLY a JSON object:
{
  "approved": <boolean>,
  "confidence": <float 0.0-1.0>,
  "reason": "<1-2 sentence explanation>",
  "suggestion": "<optional improvement suggestion if approved, or what's wrong if rejected>"
}

Be fair but firm. Most legitimate missions should pass. Only reject clearly problematic proposals.`;

export interface MissionScreeningResult {
  approved: boolean;
  confidence: number;
  reason: string;
  suggestion?: string;
}

export async function screenMissionProposal(mission: {
  title: string;
  description: string;
  category: string;
}): Promise<MissionScreeningResult> {
  if (!isAiAvailable()) {
    console.warn("[Mission Screening] OPENROUTER_API_KEY not set — auto-approving");
    return { approved: true, confidence: 0, reason: "Screening unavailable — API key not configured" };
  }

  try {
    const { content } = await callOpenRouter([
      { role: "system", content: missionScreeningPrompt },
      {
        role: "user",
        content: [
          "Screen this mission proposal for social good:",
          `Title: ${mission.title}`,
          `Description: ${mission.description}`,
          `Category: ${mission.category}`,
          "",
          "Return JSON only.",
        ].join("\n"),
      },
    ]);

    const parsed = extractJson(content) as MissionScreeningResult;
    return {
      approved: Boolean(parsed.approved),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reason: typeof parsed.reason === "string" ? parsed.reason : "No reason provided",
      suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : undefined,
    };
  } catch (error) {
    console.warn("[Mission Screening] Failed — allowing mission through:", error);
    // On failure, don't block mission creation
    return { approved: true, confidence: 0, reason: "Screening unavailable — auto-approved" };
  }
}

// ─── Proof Verification ─────────────────────────────────────

export async function verifyProof({
  missionSummary,
  proofUrl,
}: {
  missionSummary: string;
  proofUrl: string;
}): Promise<ProofVerification> {
  if (!isAiAvailable()) {
    throw new Error("OPENROUTER_API_KEY is not set — AI verification unavailable. Set the key in your environment or docker-compose.yml.");
  }

  const { content } = await callOpenRouter(
    [
      { role: "system", content: proofSystemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: `Verify this proof:\n\n${missionSummary}\n\nReturn JSON only.` },
          { type: "image_url", image_url: { url: proofUrl } },
        ],
      },
    ],
    getModels().vision,
  );

  const parsed = extractJson(content);
  const verification = parseProofVerification(parsed);

  // Apply confidence threshold policy
  const resolvedVerdict = resolveVerdict(verification.verdict, verification.confidence);

  return { ...verification, verdict: resolvedVerdict };
}
