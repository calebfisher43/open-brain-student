import asyncio
import urllib.request
import urllib.parse
import json
import re
from playwright.async_api import async_playwright

SUPABASE_URL = "https://yqjsfeboqsotrgknyzkb.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxanNmZWJvcXNvdHJna255emtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNTI4OTIsImV4cCI6MjA5NzkyODg5Mn0.G9xlPmiHivtf4Pss0Ja0m2YnT2qHh__9izkv0EXC_B8"
ANTHROPIC_API_KEY = ""  # Add your Anthropic API key here if you want richer outlines
GCU_USERNAME = "CFisher57@My.gcu.edu"

def search_brain(query):
    """Search your Supabase brain for relevant thoughts."""
    encoded = urllib.parse.quote(query)
    url = f"{SUPABASE_URL}/rest/v1/thoughts?content=ilike.*{encoded}*&limit=5&order=created_at.desc"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())

def call_llm(prompt):
    """Call Supabase LLM gateway to generate the outline."""
    data = json.dumps({
        "systemPrompt": "You are an expert academic writing assistant. Help students understand discussion questions and create strong outlines.",
        "prompt": prompt,
        "maxTokens": 1024,
    }).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/functions/v1/call-llm",
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {SUPABASE_KEY}",
        },
        method="POST"
    )
    with urllib.request.urlopen(req) as res:
        result = json.loads(res.read())
        return result.get("text", "")

def generate_outline(question, brain_context):
    """Generate a discussion post outline using the LLM."""
    brain_section = ""
    if brain_context:
        brain_section = "\n\nRELEVANT NOTES FROM YOUR BRAIN:\n" + "\n".join(
            f"- {t['content'][:200]}" for t in brain_context
        )

    prompt = f"""A student has this discussion question to answer:

QUESTION:
{question}
{brain_section}

Please provide:
1. WHAT THIS QUESTION IS ASKING (in plain English)
2. KEY POINTS TO HIT (3-5 bullet points the student should address)
3. SUGGESTED OUTLINE (intro, body paragraphs, conclusion structure)
4. TIPS (word count, tone, things to avoid)

Keep it practical and clear. The student will write the post themselves."""

    return call_llm(prompt)

async def run():
    print("\n🧠 HOMEWORK ASSISTANT AGENT")
    print("=" * 50)
    print(f"Course: MGT-325")
    print(f"School: Grand Canyon University")
    print("=" * 50)
    print("\nOpening GCU portal in browser...")
    print("⚠️  You will need to enter your password when the browser opens.\n")

    async with async_playwright() as p:
        browser = await p.webkit.launch(headless=False, slow_mo=500)
        context = await browser.new_context()
        page = await context.new_page()

        # Navigate to GCU portal
        await page.goto("https://newportal.gcu.edu")
        await page.wait_for_load_state("networkidle")

        # Fill in username if field exists
        try:
            username_field = page.locator("input[type='email'], input[name='username'], input[id*='user'], input[placeholder*='user'], input[placeholder*='email']").first
            await username_field.wait_for(timeout=5000)
            await username_field.fill(GCU_USERNAME)
            print(f"✅ Filled in username: {GCU_USERNAME}")
        except Exception:
            print("ℹ️  Please type your username and password in the browser.")

        print("\n⏳ Waiting for you to log in...")
        print("   Type your password in the browser and click Sign In.")
        print("   The agent will continue automatically once you're logged in.\n")

        # Wait until we're past the login page (up to 2 minutes)
        try:
            await page.wait_for_url("**/newportal.gcu.edu**", timeout=120000)
            await page.wait_for_load_state("networkidle")
        except Exception:
            pass

        # Wait for dashboard to load
        await asyncio.sleep(3)
        print("✅ Logged in! Looking for MGT-325...")

        # Click MGT-325
        try:
            await page.click("text=MGT-325", timeout=10000)
            await page.wait_for_load_state("networkidle")
            await asyncio.sleep(2)
            print("✅ Opened MGT-325")
        except Exception:
            print("⚠️  Could not find MGT-325 automatically. Please click on it in the browser.")
            await asyncio.sleep(10)

        # Look for discussion questions
        print("🔍 Looking for discussion questions...")
        await asyncio.sleep(3)

        question_text = ""

        # Try to find discussion content
        for selector in [
            "text=Discussion Question",
            "text=DQ",
            "[class*='discussion']",
            "[class*='Discussion']",
        ]:
            try:
                el = page.locator(selector).first
                await el.click(timeout=5000)
                await page.wait_for_load_state("networkidle")
                await asyncio.sleep(2)
                break
            except Exception:
                continue

        # Extract page text to find the question
        try:
            content = await page.inner_text("body")
            # Look for DQ patterns
            dq_match = re.search(r"(Discussion Question.*?)(?=\n\n|\Z)", content, re.DOTALL | re.IGNORECASE)
            if dq_match:
                question_text = dq_match.group(1).strip()[:1000]
        except Exception:
            pass

        if not question_text:
            print("\n⚠️  I couldn't automatically find the discussion question.")
            print("   Please copy and paste it below.\n")
            question_text = input("Paste the discussion question here: ").strip()
        else:
            print(f"\n📋 FOUND DISCUSSION QUESTION:\n{question_text[:300]}...")
            confirm = input("\nIs this the right question? (y/n): ").strip().lower()
            if confirm != "y":
                question_text = input("Paste the correct question here: ").strip()

        print("\n🔍 Searching your brain for relevant knowledge...")
        keywords = " ".join(question_text.split()[:8])
        brain_results = search_brain(keywords)
        if brain_results:
            print(f"✅ Found {len(brain_results)} relevant thoughts in your brain")
        else:
            print("ℹ️  No matching thoughts found in your brain")

        print("\n🤖 Generating your outline...\n")
        outline = generate_outline(question_text, brain_results)

        print("=" * 50)
        print("📝 YOUR HOMEWORK OUTLINE")
        print("=" * 50)
        print(outline)
        print("=" * 50)
        print("\n✅ Done! Use this outline to write your response.")
        print("   The browser is still open — navigate to the submission box when ready.")
        print("\n⚠️  Remember: Write the post in your OWN words. You submit it, not the agent.\n")

        input("Press Enter when you're done and want to close the browser...")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
