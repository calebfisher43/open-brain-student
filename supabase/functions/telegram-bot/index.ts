import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("MY_SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sendMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function saveThought(content: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/thoughts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({ content }),
  });
  return res.ok;
}

async function searchThoughts(query: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/thoughts?content=ilike.*${encodeURIComponent(query)}*&limit=5&order=created_at.desc`,
    {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  return await res.json();
}

async function recentThoughts() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/thoughts?order=created_at.desc&limit=5`,
    {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  return await res.json();
}

serve(async (req) => {
  try {
    const body = await req.json();
    const message = body?.message;
    if (!message) return new Response("ok", { status: 200 });

    const chatId = message.chat.id;
    const text = message.text || "";

    if (text.startsWith("/search ") || text.startsWith("? ")) {
      const query = text.replace(/^\/search |^\? /, "");
      const results = await searchThoughts(query);
      if (!results.length) {
        await sendMessage(chatId, "No results found for: " + query);
      } else {
        const reply = results.map((r: any, i: number) =>
          `${i + 1}. ${r.content.slice(0, 200)}`
        ).join("\n\n");
        await sendMessage(chatId, `Found ${results.length} result(s):\n\n${reply}`);
      }
    } else if (text === "/recent") {
      const results = await recentThoughts();
      const reply = results.map((r: any, i: number) =>
        `${i + 1}. ${r.content.slice(0, 200)}`
      ).join("\n\n");
      await sendMessage(chatId, `Your 5 most recent thoughts:\n\n${reply}`);
    } else if (text.startsWith("/start")) {
      await sendMessage(chatId, "👋 Welcome to your Open Brain!\n\nSend me any message to save it.\nUse /search [word] to search.\nUse /recent to see your latest thoughts.");
    } else {
      const saved = await saveThought(text);
      await sendMessage(chatId, saved ? "✅ Saved to your brain." : "❌ Error saving. Try again.");
    }
  } catch (e) {
    console.error(e);
  }
  return new Response("ok", { status: 200 });
});
