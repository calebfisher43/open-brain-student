import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("MY_SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const payload = await req.json();
    const thought = payload.record;

    if (!thought || !thought.content || thought.content.length < 20) {
      return new Response("ok", { status: 200 });
    }

    // Call the LLM gateway
    const llmRes = await fetch(`${SUPABASE_URL}/functions/v1/call-llm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        systemPrompt: "You are a knowledge management assistant. Always respond with valid JSON only.",
        prompt: `Analyze this thought and return a JSON object with exactly these fields:
- tags: array of 3-5 short lowercase tags
- category: exactly one of: idea, learning, question, reference, plan, reflection
- summary: one sentence max

Thought: "${thought.content.slice(0, 1000)}"

Respond with JSON only, no other text.`,
        maxTokens: 256,
      }),
    });

    const llmData = await llmRes.json();
    const text = llmData.text || "";

    let enrichment = { tags: [], category: "reference", summary: "" };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) enrichment = JSON.parse(jsonMatch[0]);
    } catch (_) {}

    // Update the thought with enrichment data
    await fetch(`${SUPABASE_URL}/rest/v1/thoughts?id=eq.${thought.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        tags: enrichment.tags || [],
        category: enrichment.category || "reference",
        summary: enrichment.summary || "",
        enriched_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error("Enrichment error:", e.message);
  }

  return new Response("ok", { status: 200 });
});
