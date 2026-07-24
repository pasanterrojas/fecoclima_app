<script setup lang="ts">
const props = defineProps<{ content?: string | null }>()

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[character] || character))
}

function inlineMarkdown(value: string): string {
  let text = escapeHtml(value)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  return text
}

const rendered = computed(() => {
  const source = String(props.content || '').replace(/\r\n/g, '\n').trim()
  if (!source) return ''
  const lines = source.split('\n')
  const output: string[] = []
  let list: 'ul' | 'ol' | null = null
  let inCode = false
  const codeLines: string[] = []

  const closeList = () => {
    if (list) output.push(`</${list}>`)
    list = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.trim().startsWith('```')) {
      closeList()
      if (inCode) {
        output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        codeLines.length = 0
      }
      inCode = !inCode
      continue
    }
    if (inCode) {
      codeLines.push(raw)
      continue
    }
    if (!line.trim()) {
      closeList()
      continue
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      closeList()
      const level = heading[1].length
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      continue
    }
    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      closeList()
      output.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`)
      continue
    }
    const unordered = line.match(/^[-*+]\s+(.+)$/)
    if (unordered) {
      if (list !== 'ul') { closeList(); list = 'ul'; output.push('<ul>') }
      output.push(`<li>${inlineMarkdown(unordered[1])}</li>`)
      continue
    }
    const ordered = line.match(/^\d+[.)]\s+(.+)$/)
    if (ordered) {
      if (list !== 'ol') { closeList(); list = 'ol'; output.push('<ol>') }
      output.push(`<li>${inlineMarkdown(ordered[1])}</li>`)
      continue
    }
    closeList()
    output.push(`<p>${inlineMarkdown(line.trim())}</p>`)
  }
  closeList()
  if (inCode && codeLines.length) output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  return output.join('')
})
</script>

<template><div class="markdown-content" v-html="rendered" /></template>

<style scoped>
.markdown-content{line-height:1.68;color:var(--fc-text);overflow-wrap:anywhere}.markdown-content:deep(h1),.markdown-content:deep(h2),.markdown-content:deep(h3),.markdown-content:deep(h4){color:var(--fc-primary);margin:1.1em 0 .45em;line-height:1.25}.markdown-content:deep(h1){font-size:1.55rem}.markdown-content:deep(h2){font-size:1.3rem}.markdown-content:deep(h3){font-size:1.12rem}.markdown-content:deep(p){margin:.6em 0}.markdown-content:deep(ul),.markdown-content:deep(ol){padding-left:1.35rem;margin:.65rem 0}.markdown-content:deep(li){margin:.35rem 0}.markdown-content:deep(blockquote){margin:.9rem 0;padding:.8rem 1rem;border-left:4px solid var(--fc-secondary);background:#eff7fb;border-radius:0 10px 10px 0}.markdown-content:deep(code){padding:.12rem .35rem;background:#e8f0f5;border-radius:5px;font-size:.9em}.markdown-content:deep(pre){overflow:auto;padding:1rem;background:#0f2e44;color:#eaf7ff;border-radius:10px}.markdown-content:deep(pre code){background:transparent;padding:0}.markdown-content:deep(a){color:var(--fc-secondary);text-decoration:underline}
</style>
