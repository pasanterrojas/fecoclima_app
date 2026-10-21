const storageKey = 'fecoclima-chat-browser'
let currentBrowserId: string | undefined

/** Separate from the parcel quota: chat history survives closing this browser. */
export function chatBrowserId(): string {
  if (currentBrowserId) {
    document.cookie = `fecoclima_chat_browser=${currentBrowserId}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    return currentBrowserId
  }
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(stored)) {
      currentBrowserId = stored
      document.cookie = `fecoclima_chat_browser=${stored}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
      return stored
    }
  } catch { /* Storage can be disabled; keep an ID for this page only. */ }
  currentBrowserId = crypto.randomUUID()
  try { localStorage.setItem(storageKey, currentBrowserId) } catch { /* Page-scoped fallback. */ }
  document.cookie = `fecoclima_chat_browser=${currentBrowserId}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  return currentBrowserId
}
