import {useEffect,useState} from 'react';
const KEY='tokyo-cinema:watched:v1';
type Library={watched:Record<string,string>;hide:boolean};
function read():Library {
 try {
  const data=JSON.parse(localStorage.getItem(KEY)||'{}');
  const entries=Object.entries(data.watched||{}).filter(([id,title])=>id.startsWith('film-v1:')&&typeof title==='string'&&title.length<=500).slice(0,5000);
  return {watched:Object.fromEntries(entries) as Record<string,string>,hide:data.hide===true};
 }catch{return {watched:{},hide:false};}
}
export default function useWatched(){
 const [library,setLibrary]=useState<Library>(read);
 const [storageError,setStorageError]=useState('');
 const [undo,setUndo]=useState<{key:string;title:string;wasWatched:boolean}|null>(null);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(library));setStorageError('');}catch{setStorageError('このブラウザーに保存できません。観た登録はこの画面を開いている間だけ有効です。');}},[library]);
 useEffect(()=>{const sync=(e:StorageEvent)=>{if(e.key===KEY){setLibrary(read());setUndo(null);}};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
 const toggle=(key:string,title:string)=>{
  const wasWatched=!!library.watched[key];setUndo({key,title,wasWatched});
  setLibrary(current=>{const watched={...current.watched};if(wasWatched)delete watched[key];else watched[key]=title;return {...current,watched};});
 };
 const restore=()=>{if(!undo)return;setLibrary(current=>{const watched={...current.watched};if(undo.wasWatched)watched[undo.key]=undo.title;else delete watched[undo.key];return {...current,watched};});setUndo(null);};
 return {watched:library.watched,hide:library.hide,setHide:(hide:boolean)=>setLibrary(current=>({...current,hide})),toggle,undo,restore,storageError};
}
