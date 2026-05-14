export const config = {
  matches: ["https://*.cursor.com/*"]
}
console.log("SYNC URL", process.env.PLASMO_PUBLIC_SYNC_API_URL)
console.log("SYNC SECRET", process.env.PLASMO_PUBLIC_SYNC_SECRET)
const alarmName = "cursor-session-sync"
const storageKey = "cursor-sync-state"
const syncUrl = process.env.PLASMO_PUBLIC_SYNC_API_URL
const syncSecret = process.env.PLASMO_PUBLIC_SYNC_SECRET

interface SyncState {
  lastCookieHash?: string
  lastAttemptAt?: string
  lastSyncedAt?: string
  lastError?: string
}

function setState(next: Partial<SyncState>) {
  return chrome.storage.local.get(storageKey).then((result) => {
    const current = (result[storageKey] as SyncState | undefined) ?? {}
    return chrome.storage.local.set({
      [storageKey]: {
        ...current,
        ...next
      }
    })
  })
}

function readCursorCookies(): Promise<chrome.cookies.Cookie[]> {
  return chrome.cookies.getAll({ domain: "cursor.com" })
}

function buildCookieHeader(cookies: chrome.cookies.Cookie[]): string {
  return cookies
    .filter((cookie) => cookie.domain.includes("cursor.com"))
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
  console.log(`[Sync] Starting sync process (force=${force}) at`, now)
  
  try {
    await setState({ lastAttemptAt: now, lastError: undefined })
    
    console.log("[Sync] ENV CHECK:", { syncUrl, syncSecret })
    
    if (!syncUrl || !syncSecret) {
      const missing = []
      if (!syncUrl) missing.push("URL")
      if (!syncSecret) missing.push("Secret")
      const error = `Missing sync env: ${missing.join(", ")}`
      console.error("[Sync]", error)
      await setState({ lastError: error })
      return
    }

    const cookies = await readCursorCookies()
    console.log("[Sync] Cookies read:", cookies.length)
    
    const cookieHeader = buildCookieHeader(cookies)
    if (!cookieHeader.includes("WorkosCursorSessionToken=")) {
      const error = "Cursor session cookie not found (WorkosCursorSessionToken)"
      console.warn("[Sync]", error)
      await setState({ lastError: error })
      return
    }

    const nextHash = simpleHash(cookieHeader)
    const current = await chrome.storage.local.get(storageKey)
    const state = (current[storageKey] as SyncState | undefined) ?? {}
    
    if (!force && state.lastCookieHash === nextHash) {
      console.log("[Sync] No change in cookies, skipping upload")
      await setState({ lastError: undefined })
      return
    }

    console.log("[Sync] Sending update to", syncUrl)
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
      const error = `Sync failed: ${response.status} ${response.statusText}`
      console.error("[Sync]", error)
      await setState({ lastError: error })
      return
    }

    console.log("[Sync] Successfully synced")
    await setState({
      lastCookieHash: nextHash,
      lastSyncedAt: now,
      lastError: undefined
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error("[Sync] Unhandled error during sync:", err)
    await setState({ lastError: `Error: ${errorMessage}` })
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
})

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm()
  void syncCursorSession()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === alarmName) {
    void syncCursorSession()
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "sync") {
    void syncCursorSession(true).then(() => sendResponse({ ok: true }))
    return true // Keep channel open for async response
  }
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url?.includes("cursor.com")) return
  void syncCursorSession()
})
