import asyncio
import urllib.request
import urllib.parse
import json
import sys
from playwright.async_api import async_playwright

SUPABASE_URL = "https://yqjsfeboqsotrgknyzkb.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxanNmZWJvcXNvdHJna255emtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNTI4OTIsImV4cCI6MjA5NzkyODg5Mn0.G9xlPmiHivtf4Pss0Ja0m2YnT2qHh__9izkv0EXC_B8"
GCU_USERNAME = "CFisher57@My.gcu.edu"

COURSES = {
    "his-144": "HIS-144",
    "his144":  "HIS-144",
    "fin-432": "FIN-432",
    "fin432":  "FIN-432",
    "mgt-325": "MGT-325",
    "mgt325":  "MGT-325",
}

def call_llm(prompt, system_prompt):
    data = json.dumps({
        "systemPrompt": system_prompt,
        "prompt": prompt,
        "maxTokens": 1024,
    }).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/functions/v1/call-llm",
        data=data,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {SUPABASE_KEY}"},
        method="POST"
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read()).get("text", "")

def search_brain(query):
    encoded = urllib.parse.quote(query)
    url = f"{SUPABASE_URL}/rest/v1/thoughts?content=ilike.*{encoded}*&limit=5&order=created_at.desc"
    req = urllib.request.Request(url, headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"})
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())

def write_full_response(question, brain_context):
    brain_section = ""
    if brain_context:
        brain_section = "\n\nThe student has these relevant notes in their knowledge base:\n" + \
            "\n".join(f"- {t['content'][:200]}" for t in brain_context)

    return call_llm(
        f"""Write a complete, well-structured discussion post response for this question:

QUESTION:
{question}
{brain_section}

Requirements:
- 150-250 words
- Professional academic tone
- Use first person ("I believe", "In my view")
- Include a real-world example or reference
- Strong opening sentence, clear argument, thoughtful conclusion
- Sound like a thoughtful student, not a textbook

Write the full post ready to submit. Nothing else — just the response text.""",
        "You are an expert academic writer helping a student write a thoughtful discussion post. Write naturally and like a real student would."
    )

async def find_and_fill_discussion(page, course_name):
    print(f"🔍 Looking for discussion questions in {course_name}...")

    # Try common GCU discussion link patterns
    for link_text in ["Discussion Question", "DQ", "Discussion", "Week", "Topic"]:
        try:
            link = page.locator(f"text={link_text}").first
            if await link.is_visible(timeout=2000):
                await link.click()
                await page.wait_for_load_state("networkidle")
                await asyncio.sleep(2)
                print(f"✅ Clicked: {link_text}")
                break
        except Exception:
            continue

    # Extract the question from the page
    question = ""
    try:
        body = await page.inner_text("body")
        lines = [l.strip() for l in body.split("\n") if len(l.strip()) > 60]
        # Find lines that look like questions or instructions
        for i, line in enumerate(lines):
            if any(w in line.lower() for w in ["discuss", "explain", "describe", "analyze", "reflect", "consider", "why", "how", "what"]):
                question = " ".join(lines[i:i+5])[:800]
                break
        if not question and lines:
            question = " ".join(lines[:5])[:800]
    except Exception:
        pass

    if not question:
        print("\n⚠️  Could not auto-detect the question.")
        question = input("Paste the discussion question here: ").strip()
    else:
        print(f"\n📋 Question found:\n{question[:200]}...\n")
        confirm = input("Is this the right question? (y/n): ").strip().lower()
        if confirm != "y":
            question = input("Paste the correct question: ").strip()

    # Search brain for context
    print("\n🧠 Searching your brain for relevant knowledge...")
    keywords = " ".join(question.split()[:6])
    brain = search_brain(keywords)
    if brain:
        print(f"✅ Found {len(brain)} relevant thoughts")
    else:
        print("ℹ️  No matching brain notes — writing from scratch")

    # Write the full response
    print("\n✍️  Writing your response...")
    response = write_full_response(question, brain)

    print("\n" + "="*60)
    print("📝 WRITTEN RESPONSE:")
    print("="*60)
    print(response)
    print("="*60)

    # Find the text input box and type the response
    print("\n🖊️  Looking for submission text box...")
    filled = False
    for selector in [
        "div[contenteditable='true']",
        "textarea[name*='comment']",
        "textarea[name*='body']",
        "textarea[name*='reply']",
        "iframe",
        ".ql-editor",
        "[class*='editor']",
        "textarea",
    ]:
        try:
            el = page.locator(selector).first
            if await el.is_visible(timeout=3000):
                if selector == "iframe":
                    frame = page.frame_locator(selector).first
                    body = frame.locator("body[contenteditable='true'], .ql-editor, body")
                    await body.click()
                    await body.fill(response)
                else:
                    await el.click()
                    await el.fill(response)
                print(f"✅ Response typed into submission box!")
                filled = True
                break
        except Exception:
            continue

    if not filled:
        print("⚠️  Could not find the text box automatically.")
        print("    Copy the response above and paste it manually.")

    print("\n" + "="*60)
    print("⚠️  REVIEW WHAT WAS WRITTEN ABOVE IN THE BROWSER")
    print("    Edit anything you want, then click SUBMIT yourself.")
    print("    The agent will wait here until you're done.")
    print("="*60)
    input("\nPress Enter when you have submitted (or to close the browser)...")

async def run():
    print("\n🧠 HOMEWORK AGENT")
    print("="*50)
    print("Courses available: HIS-144, FIN-432, MGT-325")
    course_input = input("\nWhich class? (e.g. MGT-325): ").strip().lower()
    course_name = COURSES.get(course_input.replace(" ", "").lower(), course_input.upper())
    print(f"\n➡️  Navigating to {course_name}")
    print("A browser will open. Enter your password when prompted.\n")

    async with async_playwright() as p:
        browser = await p.webkit.launch(headless=False, slow_mo=300)
        context = await browser.new_context()
        page = await context.new_page()

        # Go to GCU portal
        await page.goto("https://newportal.gcu.edu")
        await page.wait_for_load_state("networkidle")

        # Fill username
        try:
            for sel in ["input[type='email']", "input[name='username']", "input[id*='user']", "input[placeholder*='user']", "input[placeholder*='email']"]:
                try:
                    field = page.locator(sel).first
                    await field.fill(GCU_USERNAME, timeout=3000)
                    print(f"✅ Username filled in")
                    break
                except Exception:
                    continue
        except Exception:
            pass

        print("⏳ Please type your password and log in...")
        print("   The agent will continue automatically once you're logged in.\n")

        # Wait for login — up to 3 minutes
        try:
            await page.wait_for_function(
                "() => document.title.toLowerCase().includes('portal') || document.title.toLowerCase().includes('home') || document.title.toLowerCase().includes('dashboard')",
                timeout=180000
            )
        except Exception:
            await asyncio.sleep(5)

        await asyncio.sleep(3)
        print("✅ Logged in! Finding your course...")

        # Click the course
        clicked = False
        for attempt in [course_name, course_name.replace("-", ""), course_name.split("-")[0]]:
            try:
                await page.click(f"text={attempt}", timeout=5000)
                await page.wait_for_load_state("networkidle")
                await asyncio.sleep(2)
                print(f"✅ Opened {course_name}")
                clicked = True
                break
            except Exception:
                continue

        if not clicked:
            print(f"⚠️  Could not find {course_name} automatically.")
            print("    Please click on the course in the browser.")
            input("Press Enter once you're inside the course...")

        await find_and_fill_discussion(page, course_name)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
