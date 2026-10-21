import { parcelSessionId } from './parcelSession'
import type { ChatMessage, Parcel, ParcelAnalysis } from '~/types/plots'
export interface ParcelBrowserCache { parcels: Parcel[]; selected: string; analyses: Record<string, ParcelAnalysis>; chats: Record<string, ChatMessage[]>; technical: boolean }
const empty = (): ParcelBrowserCache => ({parcels:[],selected:'',analyses:{},chats:{},technical:false})
const key = () => `fecoclima-parcel-workspace:${parcelSessionId()}`
export function readParcelCache(): ParcelBrowserCache {
  try {
    const saved = JSON.parse(localStorage.getItem(key()) || '{}')
    return {parcels:Array.isArray(saved.parcels)?saved.parcels:[],selected:typeof saved.selected==='string'?saved.selected:'',
      analyses:saved.analyses && typeof saved.analyses==='object'?saved.analyses:{},
      chats:saved.chats && typeof saved.chats==='object'?saved.chats:{},technical:saved.technical===true}
  } catch { return empty() }
}
export function writeParcelCache(value: ParcelBrowserCache) {
  try { localStorage.setItem(key(), JSON.stringify(value)) } catch { /* The last server snapshot remains recoverable. */ }
}
