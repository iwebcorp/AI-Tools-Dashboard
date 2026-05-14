export const config = {
  matches: ["https://*.cursor.com/*", "https://chatgpt.com/*"]
}
console.log("SYNC URL", process.env.PLASMO_PUBLIC_SYNC_API_URL)
console.log("SYNC SECRET", process.env.PLASMO_PUBLIC_SYNC_SECRET)
const alarmName = "session-sync-alarm"
const cursorStorageKey = "cursor-sync-state"
const chatgptStorageKey = "chatgpt-sync-state"
const syncUrl = process.env.PLASMO_PUBLIC_SYNC_API_URL
const syncSecret = process.env.PLASMO_PUBLIC_SYNC_SECRET

interface SyncState {
  lastCookieHash?: string
  lastAttemptAt?: string
  lastSyncedAt?: string
  lastError?: string
  lastBearer?: string // ChatGPT 토큰 보관용
}

function getStorageKey(service: "cursor" | "chatgpt") {
  return service === "cursor" ? cursorStorageKey : chatgptStorageKey
}

function setState(service: "cursor" | "chatgpt", next: Partial<SyncState>) {
  const key = getStorageKey(service)
  return chrome.storage.local.get(key).then((result) => {
    const current = (result[key] as SyncState | undefined) ?? {}
    return chrome.storage.local.set({
      [key]: {
        ...current,
        ...next
      }
    })
  })
}

function readCookies(domain: string): Promise<chrome.cookies.Cookie[]> {
  return chrome.cookies.getAll({ domain })
}

function buildCookieHeader(cookies: chrome.cookies.Cookie[], domain: string): string {
  return cookies
    .filter((cookie) => cookie.domain.includes(domain))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ")
}

function simpleHash(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return String(hash)
}

async function syncCursorSession(force = false) {
  const now = new Date().toISOString()
  console.log(`[Sync-Cursor] Starting sync process (force=${force}) at`, now)
  
  try {
    await setState("cursor", { lastAttemptAt: now, lastError: undefined })
    
    if (!syncUrl || !syncSecret) {
      const error = "Missing sync env"
      console.error("[Sync-Cursor]", error)
      await setState("cursor", { lastError: error })
      return
    }

    const cookies = await readCookies("cursor.com")
    const cookieHeader = buildCookieHeader(cookies, "cursor.com")
    
    if (!cookieHeader.includes("WorkosCursorSessionToken=")) {
      const error = "Cursor session cookie not found"
      console.warn("[Sync-Cursor]", error)
      await setState("cursor", { lastError: error })
      return
    }

    const nextHash = simpleHash(cookieHeader)
    const current = await chrome.storage.local.get(cursorStorageKey)
    const state = (current[cursorStorageKey] as SyncState | undefined) ?? {}
    
    if (!force && state.lastCookieHash === nextHash) {
      console.log("[Sync-Cursor] No change, skipping upload")
      return
    }

    const response = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-secret": syncSecret
      },
      body: JSON.stringify({
        service: "cursor",
        cookies: cookieHeader,
        userAgent: navigator.userAgent,
        updatedAt: now
      })
    })

    if (!response.ok) {
      const error = `Sync failed: ${response.status}`
      await setState("cursor", { lastError: error })
      return
    }

    await setState("cursor", {
      lastCookieHash: nextHash,
      lastSyncedAt: now,
      lastError: undefined
    })
    console.log("[Sync-Cursor] Successfully synced")
  } catch (err) {
    console.error("[Sync-Cursor] Error:", err)
    await setState("cursor", { lastError: String(err) })
  }
}

async function syncChatgptSession(bearer?: string, force = false) {
  const now = new Date().toISOString()
  console.log(`[Sync-ChatGPT] Starting sync process (force=${force}) at`, now)
  
  try {
    const key = getStorageKey("chatgpt")
    const currentStorage = await chrome.storage.local.get(key)
    const state = (currentStorage[key] as SyncState | undefined) ?? {}
    
    // 전달된 bearer가 없으면 기존 저장된 bearer 사용
    let finalBearer = bearer || state.lastBearer
    
    await setState("chatgpt", { lastAttemptAt: now, lastError: undefined })
    
    if (!syncUrl || !syncSecret) {
      await setState("chatgpt", { lastError: "Missing sync env" })
      return
    }

    const cookies = await readCookies("chatgpt.com")
    const cookieHeader = buildCookieHeader(cookies, "chatgpt.com")
    
    if (!cookieHeader.includes("__Secure-next-auth.session-token")) {
      await setState("chatgpt", { lastError: "ChatGPT session cookie not found" })
      return
    }

    // bearer가 없으면 직접 세션 API 호출 시도
    if (!finalBearer) {
      console.log("[Sync-ChatGPT] No bearer provided, attempting to fetch from session API...")
      try {
        const sessionRes = await fetch("https://chatgpt.com/api/auth/session")
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json()
          if (sessionData.accessToken) {
            finalBearer = sessionData.accessToken
            console.log("[Sync-ChatGPT] Successfully fetched bearer token from session API")
          }
        }
      } catch (e) {
        console.error("[Sync-ChatGPT] Failed to fetch session:", e)
      }
    }

    const nextHash = simpleHash(cookieHeader + (finalBearer || ""))
    
    if (!force && state.lastCookieHash === nextHash) {
      console.log("[Sync-ChatGPT] No change, skipping upload")
      return
    }

    if (!finalBearer) {
      console.warn("[Sync-ChatGPT] No bearer token available. Sync might be incomplete.")
    }

    const response = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-secret": syncSecret
      },
      body: JSON.stringify({
        service: "chatgpt",
        cookies: cookieHeader,
        bearer: finalBearer || undefined,
        userAgent: navigator.userAgent,
        updatedAt: now
      })
    })

    if (!response.ok) {
      const error = `Sync failed: ${response.status}`
      await setState("chatgpt", { lastError: error })
      return
    }

    await setState("chatgpt", {
      lastCookieHash: nextHash,
      lastSyncedAt: now,
      lastError: undefined,
      lastBearer: finalBearer // 성공 시 토큰 보관
    })
    console.log("[Sync-ChatGPT] Successfully synced (with bearer: " + (finalBearer ? "YES" : "NO") + ")")
  } catch (err) {
    console.error("[Sync-ChatGPT] Error:", err)
    await setState("chatgpt", { lastError: String(err) })
  }
}

function ensureAlarm() {
  chrome.alarms.create(alarmName, {
    periodInMinutes: 5
  })
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm()
  void syncCursorSession()
  void syncChatgptSession()
})

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm()
  void syncCursorSession()
  void syncChatgptSession()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === alarmName) {
    void syncCursorSession()
    void syncChatgptSession()
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "sync") {
    // Wait for both to complete before responding
    Promise.all([
      syncCursorSession(true),
      syncChatgptSession(undefined, true)
    ]).then(() => {
      sendResponse({ ok: true })
    }).catch((err) => {
      console.error("[Sync-All] Error:", err)
      sendResponse({ ok: false, error: String(err) })
    })
    return true
  }
  
  if (message.action === "sync-service") {
    const service = message.service as "cursor" | "chatgpt"
    const promise = service === "cursor" 
      ? syncCursorSession(true) 
      : syncChatgptSession(undefined, true)
      
    promise.then(() => {
      sendResponse({ ok: true })
    }).catch((err) => {
      console.error(`[Sync-${service}] Error:`, err)
      sendResponse({ ok: false, error: String(err) })
    })
    return true
  }

  if (message.action === "sync-chatgpt") {
    void syncChatgptSession(message.bearer).then(() => sendResponse({ ok: true }))
    return true
  }
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return
  if (tab.url?.includes("cursor.com")) {
    void syncCursorSession()
  } else if (tab.url?.includes("chatgpt.com")) {
    void syncChatgptSession()
  }
})
