// Runs on every GCU page — extracts discussion questions
function extractQuestion() {
  const selectors = [
    ".discussionEntry .message",
    ".discussion-question",
    "[class*='discussion'] p",
    ".entry-content",
    ".question-body",
    "h3, h4",
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 30) return el.innerText.trim();
  }

  // Fallback: grab largest text block on page
  const paragraphs = [...document.querySelectorAll("p, div")];
  const best = paragraphs
    .map(el => el.innerText?.trim())
    .filter(t => t && t.length > 80 && t.length < 2000)
    .sort((a, b) => b.length - a.length)[0];

  return best || null;
}

// Listen for READ_GCU_TAB message from dashboard
window.addEventListener("message", (event) => {
  if (event.data?.type === "READ_GCU_TAB") {
    const question = extractQuestion();
    window.postMessage({ type: "GCU_QUESTION", question }, "*");
  }
});

// Also listen from extension popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_QUESTION") {
    sendResponse({ question: extractQuestion() });
  }
});
