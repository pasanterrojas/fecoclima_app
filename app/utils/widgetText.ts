/** Display guard for historical snapshots created before the server limit. */
export function widgetSummary(value: string | null | undefined, limit = 300): string {
  const text = String(value || '').replace(/```[\s\S]*?```/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '').replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/gm, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim()
  const characters = Array.from(text)
  if (characters.length <= limit) return text
  let prefix = characters.slice(0, limit - 1).join('')
  if (prefix.lastIndexOf(' ') >= limit / 2) prefix = prefix.slice(0, prefix.lastIndexOf(' '))
  return `${prefix.trimEnd()}…`
}
