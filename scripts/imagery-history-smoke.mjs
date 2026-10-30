import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
const exports = {}
const source = await readFile(new URL('../app/utils/imageryHistory.ts', import.meta.url), 'utf8')
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports })
const { recentImageryScenes, imagerySceneLabels, resolveImageryScene } = exports
const scenes = [1, 2, 3, 4].map(day => ({ id: `scene-${day}`, captured_at: `2026-10-0${day}T12:00:00Z`, indices: { ndvi: day / 10 } }))
assert.deepEqual(Array.from(recentImageryScenes(scenes), scene => scene.id), ['scene-4', 'scene-3', 'scene-2'])
const newScene = { id: 'scene-5', captured_at: '2026-10-05T12:00:00Z', indices: { ndvi: 0.5 } }
const result = recentImageryScenes([...scenes, newScene, scenes[3], { id: 'invalid', captured_at: 'invalid' }])
assert.deepEqual(Array.from(result, scene => scene.id), ['scene-5', 'scene-4', 'scene-3'])
assert.equal(result[0].indices.ndvi, 0.5)
assert.equal(scenes.length, 4, 'Display windows do not delete archived scenes')
assert.equal(recentImageryScenes([]).length, 0)
assert.equal(recentImageryScenes(scenes.slice(0, 1)).length, 1)
console.log('Latest three scenes, rolling replacement, values, deduplication and archive preservation verified.')

const sameDay = [
  { id: 'newest', captured_at: '2026-10-26T15:30:00Z' },
  { id: 'earlier', captured_at: '2026-10-26T15:20:00Z' },
  { id: 'previous', captured_at: '2026-10-19T15:30:00Z' },
]
const labels = imagerySceneLabels(sameDay, 'America/Costa_Rica')
assert.match(labels.get('newest'), /09:30:00/)
assert.match(labels.get('earlier'), /09:20:00/)
assert.notEqual(labels.get('newest'), labels.get('earlier'))
assert(!labels.get('previous').includes('UTC'), 'Single acquisitions keep a concise date')
const coincident = imagerySceneLabels([sameDay[0], { ...sameDay[0], id: 'other-scene' }], 'America/Costa_Rica')
assert.match(coincident.get('newest'), /imagen 1/)
assert.match(coincident.get('other-scene'), /imagen 2/)
const midnight = imagerySceneLabels([
  { id: 'a', captured_at: '2026-10-27T01:00:00Z' },
  { id: 'b', captured_at: '2026-10-26T15:30:00Z' },
], 'America/Costa_Rica')
assert.match(midnight.get('a'), /26 oct/)
assert.match(midnight.get('a'), /19:00:00/)
assert.equal(resolveImageryScene([...sameDay].reverse(), '').id, 'newest', 'Automatic selection uses the newest history entry, regardless of fallback snapshot or array order')
assert.equal(resolveImageryScene(sameDay, 'earlier').id, 'earlier', 'Explicit selection retains its image and capture instant')
assert.equal(resolveImageryScene(sameDay, 'expired').id, 'newest')
console.log('Same-day capture labels, identical instants, viewer timezone and automatic scene identity verified.')
