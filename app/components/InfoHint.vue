<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <details class="info-hint">
    <summary :aria-label="`Más información: ${text}`" title="Más información">i</summary>
    <span class="info-text">{{ text }}</span>
  </details>
</template>

<style scoped>
.info-hint{position:relative;display:inline-flex;vertical-align:middle;margin-left:6px}.info-hint summary{display:grid;place-items:center;width:23px;height:23px;border:1px solid #799fba;border-radius:50%;color:var(--fc-primary);background:#fff;font:700 .8rem/1 sans-serif;cursor:pointer;list-style:none}.info-hint summary::-webkit-details-marker{display:none}.info-hint summary:focus-visible{outline:2px solid var(--fc-primary);outline-offset:2px}.info-text{position:absolute;z-index:10;top:28px;left:0;width:min(260px,70vw);padding:10px 12px;border:1px solid var(--fc-border);border-radius:9px;box-shadow:0 8px 20px #002f5129;color:var(--fc-primary);background:#fff;font-size:.82rem;line-height:1.4;font-weight:400}
</style>
