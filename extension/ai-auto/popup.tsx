import { useEffect, useState } from "react"

interface PopupState {
  lastAttemptAt?: string
  lastSyncedAt?: string
  lastError?: string
}

const storageKey = "cursor-sync-state"

function formatTime(value?: string) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value))
}

function IndexPopup() {
  const [state, setState] = useState<PopupState>({})
  const [isSyncing, setIsSyncing] = useState(false)

  const refreshState = () => {
    void chrome.storage.local.get(storageKey).then((result) => {
      setState((result[storageKey] as PopupState | undefined) ?? {})
    })
  }

  useEffect(() => {
    refreshState()
    // Poll for state changes when popup is open
    const interval = setInterval(refreshState, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleSync = async () => {
    setIsSyncing(true)
    // Send message to background script to trigger sync
    chrome.runtime.sendMessage({ action: "sync" }, () => {
      refreshState()
      setIsSyncing(false)
    })
  }

  return (
    <div
      style={{
        minWidth: 320,
        padding: 16,
        fontFamily: "system-ui, sans-serif",
        background: "#f8fafc",
        color: "#0f172a"
      }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Cursor Session Sync</h2>
      <p style={{ fontSize: 12, color: "#475569", marginTop: 8 }}>
        cursor.com 쿠키를 주기적으로 읽어 대시보드 세션 저장소로 동기화합니다.
      </p>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          style={{
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 14,
            fontWeight: 600,
            cursor: isSyncing ? "not-allowed" : "pointer",
            opacity: isSyncing ? 0.7 : 1,
            transition: "all 0.2s"
          }}>
          {isSyncing ? "동기화 중..." : "지금 동기화"}
        </button>

        <div style={{ background: "#ffffff", borderRadius: 12, padding: 12, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>마지막 동기화</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{formatTime(state.lastSyncedAt)}</div>
        </div>
        <div style={{ background: "#ffffff", borderRadius: 12, padding: 12, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>마지막 시도</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{formatTime(state.lastAttemptAt)}</div>
        </div>
        <div style={{ background: "#ffffff", borderRadius: 12, padding: 12, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>최근 오류</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: state.lastError ? "#dc2626" : "inherit" }}>
            {state.lastError ?? "-"}
          </div>
        </div>
      </div>
    </div>
  )
}

export default IndexPopup
