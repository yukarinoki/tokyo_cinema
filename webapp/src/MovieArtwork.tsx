import React, { useState } from 'react';
export type Artwork = {url:string; sourceUrl:string; policyUrl:string; credit:string; sharedFrom?:string};
export default function MovieArtwork({artwork,title}:{artwork?:Artwork|null;title:string}) {
 const [broken,setBroken]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const usable=!!artwork&&!broken;
 return <>
  {usable&&loaded&&<div className="ambient-light" aria-hidden="true" style={{backgroundImage:`url(${JSON.stringify(artwork.url)})`}}/>}
  <figure className="film-artwork">
   {usable ? <a href={artwork.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${title}の作品紹介を公式サイトで開く`}>
    <img src={artwork.url} alt={`${title}の公式紹介画像`} loading="lazy" decoding="async" width="300" height="400" referrerPolicy="no-referrer" onLoad={()=>setLoaded(true)} onError={()=>{setBroken(true);setLoaded(false);}}/>
   </a> : <div className="artwork-fallback"><span aria-hidden="true">◯</span><span className="fallback-title">{title}</span><small>{broken?'画像を表示できません':'作品画像なし'}</small></div>}
   {usable&&<figcaption><a href={artwork.sourceUrl} target="_blank" rel="noreferrer">{artwork.sharedFrom && "同じ作品の公式画像 · "}{artwork.credit}</a></figcaption>}
  </figure>
 </>;
}
