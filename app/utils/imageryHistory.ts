/** A rolling display window; stored observations are never removed here. */
export function recentImageryScenes<T extends { id: string; captured_at: string }>(scenes: T[]): T[] {
  const unique = new Map<string, T>()
  for (const scene of scenes) {
    if (!unique.has(scene.id) && Number.isFinite(Date.parse(scene.captured_at))) unique.set(scene.id, scene)
  }
  return [...unique.values()].sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at)).slice(0, 3)
}

/** Preserve real capture instants; distinguish acquisitions sharing a calendar day. */
export function imagerySceneLabels(scenes: { id: string; captured_at: string }[], zone: string): Map<string, string> {
  const day = new Intl.DateTimeFormat('es-PY', { timeZone: zone, dateStyle: 'medium' })
  const instant = new Intl.DateTimeFormat('es-PY', {
    timeZone: zone, year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset',
  })
  const days = scenes.map(scene => day.format(new Date(scene.captured_at)))
  const labels = scenes.map((scene, index) => days.filter(value => value === days[index]).length > 1
    ? instant.format(new Date(scene.captured_at)).replace('GMT', 'UTC') : days[index]!)
  return new Map(scenes.map((scene, index) => {
    const same = labels.map((label, i) => label === labels[index] ? i : -1).filter(i => i >= 0)
    return [scene.id, same.length > 1 ? `${labels[index]} · imagen ${same.indexOf(index) + 1}` : labels[index]!]
  }))
}

/** The automatic option and its label must resolve to the same newest scene. */
export function resolveImageryScene<T extends { id: string; captured_at: string }>(scenes: T[], selectedId: string): T | undefined {
  return scenes.find(scene => scene.id === selectedId) || recentImageryScenes(scenes)[0]
}
