import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://chatgpt.com/*"]
}

function extractBearerToken(): string | null {
  try {
    // ChatGPT stores its auth token in a specific localStorage key or via a state object
    // We can check common keys or attempt to find a JWT-like string
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith("@@auth0spajs@@") || key?.includes("auth-session")) {
        const item = localStorage.getItem(key)
        if (item) {
          const parsed = JSON.parse(item)
          if (parsed.body?.access_token) return parsed.body.access_token
          if (parsed.access_token) return parsed.access_token
        }
      }
    }
    
    // Fallback: check session storage or other patterns if needed
    return null
  } catch (e) {
    console.error("[ChatGPT-CS] Error extracting token:", e)
    return null
  }
}

async function syncSession() {
  const token = extractBearerToken()
  if (!token) {
    console.log("[ChatGPT-CS] Bearer token not found yet")
    return
  }

  console.log("[ChatGPT-CS] Found Bearer token, notifying background")
  chrome.runtime.sendMessage({
    action: "sync-chatgpt",
    bearer: token
  })
}

// Run on load
void syncSession()

// Also listen for potential changes or set an interval if it's dynamic
setInterval(syncSession, 30000)
