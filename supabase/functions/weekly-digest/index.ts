import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("MY_SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (_req) => {
  try {
    // Get thoughts from the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/thoughts?created_at=gte.${sevenDaysAgo}&or=(category.is.null,category.neq.digest)&order=created_at.desc&limit=100`,
      { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } }
    );
    const thoughts = await res.json();

    if (!thoughts.length || thoughts.length < 2) {
      console.log("Not enough thoughts for a digest:", thoughts.length);
      return new Response("ok", { status: 200 });
    }

    // Group by category
    const grouped: Record<string, string[]> = {};
    for (const t of thoughts) {
      const cat = t.category || "uncategorized";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(t.summary || t.content.slice(0, 200));
    }

    const groupedText = Object.entries(grouped)
      .map(([cat, items]) => `${cat.toUpperCase()}:\n${items.map(i => `- ${i}`).join("\n")}`)
      .join("\n\n");

    // Call LLM gateway for the digest
    const llmRes = await fetch(`${SUPABASE_URL}/functions/v1/call-llm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        systemPrompt: "You are a personal knowledge assistant writing a weekly brain digest.",
        prompt: `Here are the thoughts captured this week, grouped by category:\n\n${groupedText}\n\nWrite a weekly digest that includes:
1. A short summary of what this person was learning and thinking about
2. Key themes that emerged
3. One interesting question they seem to be exploring

Keep it personal, insightful, and under 300 words.`,
        maxTokens: 512,
      }),
    });

    const llmData = await llmRes.json();
    const digestText = `📊 WEEKLY BRAIN DIGEST\n${new Date().toLocaleDateString()}\n\n${llmData.text}`;

    // Save digest as a new thought
    await fetch(`${SUPABASE_URL}/rest/v1/thoughts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        content: digestText,
        category: "digest",
        summary: "Automated weekly brain digest",
        tags: ["digest", "weekly", "summary"],
      }),
    });

    console.log("Weekly digest saved successfully");
  } catch (e) {
    console.error("Digest error:", e.message);
  }

  return new Response("ok", { status: 200 });
});
