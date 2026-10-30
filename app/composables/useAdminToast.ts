export function useAdminToast() {
  const toasts = useState<{ id: number; message: string; tone: 'success' | 'error' }[]>('admin-toasts', () => [])
  function dismiss(id: number) { toasts.value = toasts.value.filter(toast => toast.id !== id) }
  function show(message: string, tone: 'success' | 'error' = 'success') {
    const id = Date.now() + Math.random()
    toasts.value = [...toasts.value.slice(-3), { id, message, tone }]
    if (tone === 'success') setTimeout(() => dismiss(id), 7000)
  }
  return { toasts, show, dismiss }
}
