import { useEffect, useState } from "react"

interface SyncState {
  lastCookieHash?: string
  lastAttemptAt?: string
  lastSyncedAt?: string
  lastError?: string
}

interface PopupState {
  cursor?: SyncState
  chatgpt?: SyncState
}

const cursorStorageKey = "cursor-sync-state"
const chatgptStorageKey = "chatgpt-sync-state"

function formatTime(value?: string) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value))
}

function ServiceCard({
  title,
  service,
  state,
  icon,
  onSync
}: {
  title: string
  service: "cursor" | "chatgpt"
  state: SyncState
  icon?: string
  onSync: (service: "cursor" | "chatgpt") => void
}) {
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = () => {
    setIsSyncing(true)
    onSync(service)
    setTimeout(() => setIsSyncing(false), 2000)
  }

  return (
    <div style={{ background: "#ffffff", borderRadius: 12, padding: 14, border: "1px solid #e2e8f0", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          {icon && <span>{icon}</span>}
          {title}
        </h3>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          style={{
            background: "#f1f5f9",
            color: "#475569",
            border: "none",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            cursor: isSyncing ? "not-allowed" : "pointer",
            transition: "all 0.2s"
          }}>
          {isSyncing ? "..." : "Sync"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.025em" }}>
            Last Sync
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{formatTime(state.lastSyncedAt)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.025em" }}>
            Last Attempt
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{formatTime(state.lastAttemptAt)}</div>
        </div>
      </div>

      {state.lastError && (
        <div
          style={{
            marginTop: 10,
            padding: "6px 8px",
            background: "#fef2f2",
            borderRadius: 6,
            fontSize: 11,
            color: "#b91c1c",
            border: "1px solid #fee2e2",
            wordBreak: "break-word"
          }}>
          {state.lastError}
        </div>
      )}
    </div>
  )
}

function IndexPopup() {
  const [state, setState] = useState<PopupState>({ cursor: {}, chatgpt: {} })
  const [isSyncingAll, setIsSyncingAll] = useState(false)

  const refreshState = () => {
    void chrome.storage.local.get([cursorStorageKey, chatgptStorageKey]).then((result) => {
      setState({
        cursor: (result[cursorStorageKey] as SyncState | undefined) ?? {},
        chatgpt: (result[chatgptStorageKey] as SyncState | undefined) ?? {}
      })
    })
  }

  useEffect(() => {
    refreshState()
    const interval = setInterval(refreshState, 2000)
    return () => clearInterval(interval)
  }, [])

  const handleSyncService = (service: "cursor" | "chatgpt") => {
    chrome.runtime.sendMessage({ action: "sync-service", service }, () => {
      refreshState()
    })
  }

  const handleSyncAll = () => {
    setIsSyncingAll(true)
    chrome.runtime.sendMessage({ action: "sync" }, () => {
      refreshState()
      setIsSyncingAll(false)
    })
  }

  return (
    <div
      style={{
        minWidth: 320,
        padding: 16,
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "#f8fafc",
        color: "#0f172a"
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: "-0.025em" }}>AI Session Sync</h2>
        <button
          onClick={handleSyncAll}
          disabled={isSyncingAll}
          style={{
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: isSyncingAll ? "not-allowed" : "pointer",
            opacity: isSyncingAll ? 0.7 : 1,
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
          }}>
          {isSyncingAll ? "Syncing..." : "Sync All"}
        </button>
      </div>

      <ServiceCard title="Cursor" service="cursor" state={state.cursor || {}} icon="C" onSync={handleSyncService} />
      <ServiceCard
        title="ChatGPT"
        service="chatgpt"
        state={state.chatgpt || {}}
        icon="G"
        onSync={handleSyncService}
      />

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
          Automatically syncs session cookies to your dashboard.
        </p>
      </div>
    </div>
  )
}

export default IndexPopup
