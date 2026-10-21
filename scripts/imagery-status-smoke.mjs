import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
async function compile(path, globals={}) {
 const exports={}
 const source=await readFile(new URL(path,import.meta.url),'utf8')
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,...globals})
 return exports
}
const {imageryStatus}=await compile('../app/utils/imageryStatus.ts')
assert.equal(imageryStatus('PROCESSING',true,false,true,'').label,'Datos disponibles')
assert.equal(imageryStatus('PROCESSING',false,false,true,'').busy,false)
assert.match(imageryStatus('PROCESSING',false,false,true,'').message,/Actualizar imágenes/)
assert.equal(imageryStatus('AVAILABLE',true,false,false,'').label,'Datos disponibles')
assert.equal(imageryStatus('PROCESSING',true,false,false,'').busy,false)
assert.equal(imageryStatus('PROCESSING',true,true,false,'').busy,false)
assert.match(imageryStatus('PROCESSING',true,false,false,'').message,/ya están disponibles/)
assert.equal(imageryStatus('PROCESSING',false,false,false,'').busy,true)
const queue=[],delays=[]
let calls=0,failNext=false
const {useParcelImagery}=await compile('../app/composables/useParcelImagery.ts',{
 ref:value=>({value}),computed:fn=>({get value(){return fn()}}),watch:()=>{},onBeforeUnmount:()=>{},
 setTimeout:(fn,delay)=>{queue.push(fn);delays.push(delay);return queue.length},clearTimeout:()=>{},
 usePublicParcelApi:()=>({request:async()=>{calls++;if(failNext){failNext=false;throw Error('network')};return {id:'preview',status:'PROCESSING',satellite:null,history:[]}}}),
})
const preview=useParcelImagery({value:{type:'Polygon'}},{value:true})
await preview.load()
for(let i=0;i<45;i++)await queue.shift()()
assert.equal(preview.pollingPaused.value,false)
assert(delays.includes(15000),'Polling continues more slowly after the first two minutes')
failNext=true;await queue.shift()()
assert.match(preview.error.value,/Reintentaremos/)
await queue.shift()()
assert.equal(preview.error.value,'')
while(queue.length)await queue.shift()()
assert.equal(preview.pollingPaused.value,true)
assert.equal(calls,121)
console.log('Imagery state, prolonged polling, network recovery and bounded pause verified.')
