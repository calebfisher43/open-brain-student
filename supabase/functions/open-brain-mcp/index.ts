import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("MY_SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

async function searchThoughts(query: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/thoughts?content=ilike.*${encodeURIComponent(query)}*&limit=10&order=created_at.desc`,
    { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } }
  );
  return await res.json();
}

async function listRecent(limit = 10) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/thoughts?order=created_at.desc&limit=${limit}`,
    { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } }
  );
  return await res.json();
}

async function homeworkAssistant(question: string) {
  // Search brain for relevant knowledge
  const searchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/thoughts?content=ilike.*${encodeURIComponent(question.split(" ").slice(0, 6).join(" "))}*&limit=5&order=created_at.desc`,
    { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } }
  );
  const brainResults = await searchRes.json();

  const brainSection = brainResults.length
    ? "\n\nRELEVANT NOTES FROM YOUR BRAIN:\n" + brainResults.map((t: any) => `- ${t.content.slice(0, 200)}`).join("\n")
    : "";

  const llmRes = await fetch(`${SUPABASE_URL}/functions/v1/call-llm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({
      systemPrompt: "You are an expert academic writing assistant helping a student understand and outline discussion questions. Always remind the student to write in their own words.",
      prompt: `A student has this discussion question:\n\n${question}${brainSection}\n\nProvide:\n1. WHAT THIS IS ASKING (plain English)\n2. KEY POINTS TO HIT (3-5 bullets)\n3. SUGGESTED OUTLINE (intro, 2-3 body points, conclusion)\n4. TIPS (tone, length, what to avoid)\n\nEnd with: "✏️ Write this in your own words and submit it yourself."`,
      maxTokens: 1024,
    }),
  });
  const llmData = await llmRes.json();
  return llmData.text || "Could not generate outline.";
}

async function addThought(content: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/thoughts`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify({ content }),
  });
  const data = await res.json();
  return data[0];
}

const TOOLS = [
  {
    name: "search_thoughts",
    description: "Search the user's personal knowledge base for thoughts, notes, and captured content",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_recent",
    description: "List the most recently saved thoughts from the user's brain",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of thoughts to return (default 10)" },
      },
    },
  },
  {
    name: "homework_assistant",
    description: "Takes a discussion question from school and returns a detailed outline, key points, and writing tips. Searches the user's brain for relevant knowledge. Always reminds the user to write in their own words.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The full discussion question from school" },
      },
      required: ["question"],
    },
  },
  {
    name: "add_thought",
    description: "Save a new thought or piece of information to the user's brain",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The content to save" },
      },
      required: ["content"],
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Validate access key
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (token !== MCP_ACCESS_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { jsonrpc, id, method, params } = body;

    let result: any;

    if (method === "tools/list") {
      result = { tools: TOOLS };
    } else if (method === "tools/call") {
      const { name, arguments: args } = params;
      if (name === "search_thoughts") {
        const data = await searchThoughts(args.query);
        result = {
          content: [{
            type: "text",
            text: data.length
              ? data.map((t: any) => `[${new Date(t.created_at).toLocaleDateString()}] ${t.content}`).join("\n\n---\n\n")
              : "No results found for: " + args.query,
          }],
        };
      } else if (name === "list_recent") {
        const data = await listRecent(args?.limit || 10);
        result = {
          content: [{
            type: "text",
            text: data.map((t: any) => `[${new Date(t.created_at).toLocaleDateString()}] ${t.content}`).join("\n\n---\n\n"),
          }],
        };
      } else if (name === "homework_assistant") {
        const outline = await homeworkAssistant(args.question);
        result = { content: [{ type: "text", text: outline }] };
      } else if (name === "add_thought") {
        const saved = await addThought(args.content);
        result = {
          content: [{ type: "text", text: `Saved: ${saved?.content || args.content}` }],
        };
      } else {
        result = { content: [{ type: "text", text: "Unknown tool: " + name }] };
      }
    } else if (method === "initialize") {
      result = {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "open-brain", version: "1.0.0" },
      };
    } else {
      result = {};
    }

    return new Response(JSON.stringify({ jsonrpc, id, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
