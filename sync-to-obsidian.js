const https = require("https");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = "https://yqjsfeboqsotrgknyzkb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxanNmZWJvcXNvdHJna255emtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNTI4OTIsImV4cCI6MjA5NzkyODg5Mn0.G9xlPmiHivtf4Pss0Ja0m2YnT2qHh__9izkv0EXC_B8";
const VAULT_PATH = "/Users/calebjfisher/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian/My Brain";

function sanitize(str) {
  return str.replace(/[/\\:*?"<>|#^[\]]/g, "-").trim().slice(0, 80);
}

function fetchThoughts() {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/thoughts?order=created_at.desc&limit=500`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    };
    https.get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}

async function sync() {
  console.log("Fetching thoughts from Supabase...");
  const thoughts = await fetchThoughts();
  console.log(`Found ${thoughts.length} thoughts`);

  let created = 0;

  for (const thought of thoughts) {
    const category = thought.category || "uncategorized";
    const date = new Date(thought.created_at);
    const dateStr = date.toISOString().split("T")[0];
    const preview = sanitize(thought.content.slice(0, 60));
    const fileName = `${dateStr} ${preview}.md`;
    const folderPath = path.join(VAULT_PATH, category);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const filePath = path.join(folderPath, fileName);
    if (fs.existsSync(filePath)) continue; // skip if already synced

    const tags = (thought.tags || []).map(t => `#${t}`).join(" ");
    const content = `---
created: ${date.toISOString()}
category: ${category}
tags: [${(thought.tags || []).join(", ")}]
---

${thought.content}

${thought.summary ? `\n> **Summary:** ${thought.summary}` : ""}
${tags ? `\n${tags}` : ""}
`;

    fs.writeFileSync(filePath, content);
    created++;
  }

  console.log(`Done! Created ${created} new notes in Obsidian.`);
  console.log(`Vault: ${VAULT_PATH}`);
}

sync().catch(console.error);
