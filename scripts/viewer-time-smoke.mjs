#!/usr/bin/env node
/** Real date formatting code: offsets change presentation, never the instant. */
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
const source=await readFile(new URL('../app/utils/viewerTime.ts',import.meta.url),'utf8')
const module={exports:{}}
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module.exports,Intl,Date})
const {timestampInstant,formatViewerDateTime:format,formatViewerDate:date}=module.exports
const cr='America/Costa_Rica',py='America/Asuncion'
const utc='2026-10-20T22:30:00Z',station='2026-10-20T19:30:00-03:00',local='2026-10-20T16:30:00-06:00'
assert.equal(timestampInstant(utc).getTime(),timestampInstant(station).getTime())
assert.equal(timestampInstant(local).getTime(),timestampInstant(station).getTime())
assert.equal(format(utc,cr),format(station,cr))
assert.match(format(utc,cr),/4:30.*UTC-6/)
assert.match(format(utc,py),/7:30.*UTC-3/)
// Crossing midnight must shift an instant's display date, never a sowing/forecast date.
assert.notEqual(date('2026-10-21T01:00:00Z',cr),date('2026-10-21T01:00:00Z','Asia/Tokyo'))
for(const zone of [cr,py,'Pacific/Honolulu','Pacific/Kiritimati','Asia/Tokyo']){
 assert.equal(format('2026-10-01',zone),date('2026-10-01','UTC'))
 assert.equal(date('2026-10-01',zone),date('2026-10-01','UTC'))
}
// Ambiguous repeated local hours keep distinct offsets, instead of appearing identical.
assert.match(format('2026-11-01T05:30:00Z','America/New_York'),/UTC-4/)
assert.match(format('2026-11-01T06:30:00Z','America/New_York'),/UTC-5/)
assert.equal(timestampInstant('2026-10-20T19:30:00'),null)
assert.match(format('2026-10-20T19:30:00',cr),/sin zona/)
assert.match(date('2026-02-30',cr),/no válida/)
assert.equal(format(null,cr),'Sin fecha')
const reference=timestampInstant('2026-10-20T22:47:00Z').getTime()
for(const stamp of [utc,station,local])assert.equal((reference-timestampInstant(stamp).getTime())/60000,17)
console.log('TIME OK: viewer zones, ISO offsets, calendar dates, midnight, DST ambiguity, missing offsets, unchanged 17-minute reading age.')
