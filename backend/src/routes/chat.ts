import { Router, Request, Response } from 'express';

const router = Router();

// System prompt tailored for Indian Agriculture
const SYSTEM_PROMPT = `You are Agro Mind, an expert AI assistant for Indian farmers.
You specialise in:
- Crop cultivation practices for Indian states (Punjab, Haryana, UP, Maharashtra, AP, etc.)
- Soil health, fertiliser recommendations (NPK, DAP, urea, micronutrients)
- Pest and disease identification and organic/chemical treatment
- Water management and irrigation scheduling (drip, flood, sprinkler)
- Weather-based farming decisions and IMD forecasts
- Government schemes: PM-KISAN, MSP, e-NAM, Pradhan Mantri Fasal Bima Yojana
- Mandi prices, APMC regulations, and market linkages
- Organic farming, crop rotation, and intercropping systems
- Post-harvest storage, processing, and value chain

Always respond in clear, practical language. Prefer metric units.
When discussing fertilisers or pesticides, mention dosage per hectare.
Always remind farmers to consult their local KVK (Krishi Vigyan Kendra) for region-specific advice.
If asked in Hindi or Punjabi, respond in that language.`;

/**
 * POST /api/chat/message
 * Body: { message: string, history: [{role: "user"|"assistant", content: string}] }
 * Response: { reply: string }
 *
 * Uses Gemini (preferred) with OpenAI as fallback.
 */
router.post('/message', async (req: Request, res: Response) => {
  const { message, history = [] } = req.body as {
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  // ── Try Gemini first ───────────────────────────────────────────────────────
  if (process.env.GEMINI_API_KEY) {
    try {
      const reply = await callGemini(message, history);
      res.json({ reply });
      return;
    } catch (err) {
      console.warn('[chat] Gemini failed, trying OpenAI fallback:', (err as Error).message);
    }
  }

  // ── Fallback to OpenAI ─────────────────────────────────────────────────────
  if (process.env.OPENAI_API_KEY) {
    try {
      const reply = await callOpenAI(message, history);
      res.json({ reply });
      return;
    } catch (err) {
      console.error('[chat] OpenAI also failed:', (err as Error).message);
    }
  }

  // ── No API key configured ──────────────────────────────────────────────────
  res.status(503).json({
    error: 'No AI API key configured. Set GEMINI_API_KEY or OPENAI_API_KEY in .env',
  });
});

// ── Gemini (Google Generative AI) ─────────────────────────────────────────────
async function callGemini(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  // Dynamic import so the app starts even if the package isn't installed yet
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Build chat history for Gemini (role names differ from OpenAI)
  const geminiHistory = history.map(h => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }],
  }));

  const chat = model.startChat({
    history: [
      // Inject system prompt as the first user/model exchange
      { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: 'Understood. I am Agro Mind, your Indian agriculture assistant.' }] },
      ...geminiHistory,
    ],
  });

  const result = await chat.sendMessage(message);
  return result.response.text();
}

// ── OpenAI ────────────────────────────────────────────────────────────────────
async function callOpenAI(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 800,
  });

  return completion.choices[0]?.message?.content ?? 'Sorry, I could not generate a response.';
}

export default router;
