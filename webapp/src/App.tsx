import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import MovieArtwork, {Artwork} from './MovieArtwork';
import useWatched from './useWatched';

type Place = { latitude:number; longitude:number; label?:string };
type Mode = 'walk'|'transit'|'bicycle';
type Result = {
  movieKey:string; canonicalTitle:string; artwork?:Artwork|null;
  title:string; subtitle:string; screenType:string; screen?:string; startsAt:number; spareMinutes:number;
  departureAt:number; featureStartsAt:number|null; endsAt:number|null; runtimeMinutes:number|null; featureStatus:string; runtimeSourceUrl:string|null;
  theater:{name:string; address:string; sourceUrl:string; verifiedAt:number; latitude:number; longitude:number};
  route:{seconds:number; arrivalAt:number; estimated:boolean; source:string; checkedAt:number};
};
type Search = { results:Result[]; warnings:string[]; reason:string; searchedAt:number; checkedTheaters:number; routedTheaters?:number; omittedTheaters?:string[]; unavailableRoutes:number };
const stations:Record<string,Place> = {
  '新宿駅':{latitude:35.69092,longitude:139.70026},
  '渋谷駅':{latitude:35.65803,longitude:139.70164},
  '池袋駅':{latitude:35.72950,longitude:139.71090},
  '東京駅':{latitude:35.68124,longitude:139.76713},
  '上野駅':{latitude:35.71377,longitude:139.77725},
  '吉祥寺駅':{latitude:35.70312,longitude:139.57977}
};
const format = (time:number) => new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(time);
async function api(url:string, options:RequestInit={}) {
  const response = await fetch(url,options);
  const body = await response.json();
  if(!response.ok) throw new Error(body.error || '通信に失敗しました。再試行してください。');
  return body;
}
export default function App() {
  const library=useWatched();
  const undoButton=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{if(library.undo&&library.hide)undoButton.current?.focus({preventScroll:true});},[library.undo,library.hide]);
  const [locationText,setLocationText] = useState('');
  const [origin,setOrigin] = useState<Place|null>(null);
  const [places,setPlaces] = useState<Place[]>([]);
  const [mode,setMode] = useState<Mode>('walk');
  const [margin,setMargin] = useState(10);
  const [estimates,setEstimates] = useState(false);
  const [filter,setFilter] = useState('');
  const [cinemaScope,setCinemaScope] = useState('');
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const [data,setData] = useState<Search|null>(null);
  const [now,setNow] = useState(Date.now());
  const generation = useRef(0);
  const controller = useRef<AbortController|null>(null);
  const invalidate = () => { generation.current++; controller.current?.abort(); setData(null); setError(''); setBusy(''); setPlaces([]); };
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),15000);return()=>{clearInterval(timer);controller.current?.abort();};},[]);
  const choose = (place:Place,label?:string) => { invalidate();setOrigin({...place,label:label||place.label});setLocationText(label||place.label||'現在地'); };
  const locate = () => {
    invalidate(); setOrigin(null);
    if(!window.isSecureContext) {setError('HTTP接続では現在地を取得できません。駅名・住所・座標を入力してください。現在地の取得にはHTTPS接続が必要です。');return;}
    if(!navigator.geolocation) {setError('このブラウザーは現在地に対応していません。駅名・住所・座標を入力してください。');return;}
    setBusy('現在地を取得中…');const id=generation.current;
    navigator.geolocation.getCurrentPosition(p=>{
      if(id!==generation.current)return;
      choose({latitude:p.coords.latitude,longitude:p.coords.longitude},'現在地');
    },e=>{
      if(id!==generation.current)return;
      setBusy('');setError(e.code===1?'位置情報が許可されていません。駅名・住所・座標を入力してください。':'現在地を取得できません。駅名・住所・座標を入力してください。');
    },{timeout:10000,maximumAge:60000,enableHighAccuracy:false});
  };
  const findPlace = async () => {
    invalidate();setOrigin(null);
    const text=locationText.trim();
    if(stations[text]) { choose(stations[text],text);return; }
    const match=text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if(match) {
      const latitude=Number(match[1]),longitude=Number(match[2]);
      if(Math.abs(latitude)<=90 && Math.abs(longitude)<=180) {choose({latitude,longitude},text);return;}
      setError('緯度は −90〜90、経度は −180〜180 で入力してください。');return;
    }
    if(!text) {setError('駅名・住所、または緯度, 経度を入力してください。');return;}
    const id=generation.current;controller.current=new AbortController();setBusy('場所を検索中…');
    try { const response=await api('/api/places?q='+encodeURIComponent(text),{signal:controller.current.signal});
      if(id!==generation.current)return;
      setPlaces(response.places);if(!response.places.length)setError('場所が見つかりません。詳しい住所または座標を入力してください。');
    } catch(e) {if(id===generation.current)setError('場所を検索できません。主要駅ボタンか緯度, 経度を利用できます。');}
    finally {if(id===generation.current)setBusy('');}
  };
  const search = async () => {
    if(!origin)return;
    invalidate();const id=generation.current;controller.current=new AbortController();setBusy('上映と経路を確認中…');
    const currentController=controller.current;
    const timeout=setTimeout(()=>currentController.abort(),90000);
    try {
      const response=await api('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.current.signal,
        body:JSON.stringify({origin:{latitude:origin.latitude,longitude:origin.longitude},mode,margin,allowEstimates:estimates,cinemaScope})});
      if(id===generation.current){setData(response);setNow(Date.now());}
    } catch(e) {if(id===generation.current)setError(e instanceof Error && e.name!=='AbortError'?e.message:'検索がタイムアウトしました。再検索してください。');}
    finally {clearTimeout(timeout);if(id===generation.current)setBusy('');}
  };
  const expired=!!data && now-data.searchedAt>120000;
  const matchingResults=(data?.results||[]).filter(r=>r.startsAt>now &&
    (r.title+' '+r.theater.name).toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
  const results=matchingResults.filter(r=>!library.hide||!library.watched[r.movieKey]);
  const hiddenCount=matchingResults.length-results.length;
  const directions=(r:Result) => 'https://www.google.com/maps/dir/?'+new URLSearchParams({
    api:'1',origin:origin?origin.latitude+','+origin.longitude:'',destination:r.theater.latitude+','+r.theater.longitude,
    travelmode:{walk:'walking',transit:'transit',bicycle:'bicycling'}[mode]}).toString();
  return <div className="app">
    <header><div className="hero-top"><span className="eyebrow">YOUR NEXT SCREENING</span><span className="city-label">東京 / NOW SHOWING</span></div>
      <h1>tokyo cinema</h1><div className="hero-bottom"><p>次の一本に、間に合う。</p><span>出発地から、今観られる映画へ。<br/>移動時間と到着の余裕を含めて探します。</span></div></header>
    <main>
      <section className="panel" aria-labelledby="search-title">
        <h2 id="search-title">出発地と移動手段</h2>
        <label htmlFor="location">駅名・住所・緯度, 経度</label>
        <div className="location-row"><input id="location" value={locationText} placeholder="例：新宿駅、35.6909, 139.7003"
          onChange={e=>{invalidate();setOrigin(null);setLocationText(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();findPlace();}}}/>
          <button type="button" onClick={findPlace}>場所を検索</button><button type="button" onClick={locate}>現在地を使う</button></div>
        <div className="stations" aria-label="主要駅から選択">{Object.entries(stations).map(([name,p])=><button key={name} onClick={()=>choose(p,name)}>{name}</button>)}</div>
        {places.length>0 && <ul className="places" aria-label="場所の候補">{places.map((p,i)=><li key={i}><button onClick={()=>choose(p)}>{p.label}</button></li>)}</ul>}
        {origin && <p className="selected">出発地：{origin.label} <small>（{origin.latitude.toFixed(4)}, {origin.longitude.toFixed(4)}）</small></p>}
        <fieldset><legend>移動手段</legend><div className="modes">
          {([['walk','徒歩'],['transit','電車・公共交通'],['bicycle','自転車']] as [Mode,string][]).map(([value,label])=><label key={value} className={mode===value?'active':''}>
            <input type="radio" name="mode" value={value} checked={mode===value} onChange={()=>{invalidate();setMode(value);}}/>{label}</label>)}
        </div></fieldset>
        <div className="settings"><label htmlFor="margin">上映前の到着余裕 <select id="margin" value={margin} onChange={e=>{invalidate();setMargin(Number(e.target.value));}}>
          {[0,5,10,15,20,30,45,60].map(n=><option key={n} value={n}>{n}分</option>)}</select></label>
          {mode!=='transit' && <label className="check"><input type="checkbox" checked={estimates} onChange={e=>{invalidate();setEstimates(e.target.checked);}}/>経路が取得できない場合、概算を許可</label>}</div>
        <p className="hint">{mode==='transit'?'電車・公共交通は経路サービスの応答が必要です。直線距離で代用しません。':'概算は直線距離をもとにした目安です。道路や通行制限は考慮されません。'}</p>
        <label htmlFor="cinema-scope">検索対象の映画館名（任意）</label><input id="cinema-scope" value={cinemaScope} placeholder="例：TOHO、池袋、調布" onChange={e=>{invalidate();setCinemaScope(e.target.value);}}/>
        <p className="hint">公開の道路経路は、出発地に近い最大10館を確認します。遠方の館は名前を指定して検索できます。</p>
        <p id="routing-disclosure" className="privacy">徒歩・自転車の検索では、出発地と映画館の座標を FOSSGIS（routing.openstreetmap.de）に送信します。経路リクエストは同サービスのログに記録されます。 <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">利用条件</a> ・ <a href="https://www.fossgis.de/datenschutzerkl%C3%A4rung" target="_blank" rel="noreferrer">プライバシー</a></p>
        <p className="privacy">住所検索は OpenStreetMap に送信します。Google 経路が設定済みの場合は座標を Google Maps に送信します。</p>
        <button className="primary" aria-describedby="routing-disclosure" disabled={!origin || !!busy} onClick={search}>今から間に合う上映を探す</button>
      </section>
      <section className="results" aria-labelledby="results-title" aria-busy={!!busy}>
        <div className="results-heading"><h2 id="results-title">これからの上映</h2><span>すべて日本時間（JST）</span></div>
        <div className="watch-toolbar"><label className="check"><input type="checkbox" checked={library.hide} onChange={e=>library.setHide(e.target.checked)}/>観た映画を非表示</label>
          <details className="watch-library"><summary>観た作品 {Object.keys(library.watched).length}本</summary><p className="hint">このブラウザーだけに保存します。字幕・吹替など同じ作品の上映をまとめて扱います。</p>
            {!Object.keys(library.watched).length ? <p>まだ登録していません。</p> : <ul>{Object.entries(library.watched).map(([key,title])=><li key={key}><span>{title}</span><button onClick={()=>library.toggle(key,title)} aria-label={`${title}の観た登録を解除`}>解除</button></li>)}</ul>}
          </details></div>
        {library.storageError&&<p role="status" className="notice">{library.storageError}</p>}
        {library.undo&&<div role="status" className="undo-notice">「{library.undo.title}」を{library.undo.wasWatched?'観た作品から解除しました':'観た作品に登録しました'}。<button ref={undoButton} onClick={library.restore}>元に戻す</button></div>}
        {busy && <p role="status" className="notice">{busy}</p>}
        {error && <p role="alert" className="notice error">{error}</p>}
        {!data && !busy && !error && <div className="empty">出発地を選んで検索してください。今から24時間以内の、確認済みの上映を調べます。</div>}
        {data && <>
          <p className="hint">{format(data.searchedAt)} に確認 / 上映確認 {data.checkedTheaters}館 / 経路取得 {data.routedTheaters ?? 0}館 / 到着余裕 {margin}分</p>
          {data.warnings.map(w=><p className="notice" key={w}>{w}</p>)}
          {!!data.omittedTheaters?.length && <details><summary>公開道路経路の対象外 {data.omittedTheaters.length}館を確認</summary><ul>{data.omittedTheaters.map(name=><li key={name}>{name}</li>)}</ul></details>}
          {expired ? <div className="notice" role="status">検索から2分経過しました。今から出発する経路を再確認してください。<button onClick={search}>再検索</button></div> : <>
          <label htmlFor="filter">映画・映画館で絞り込み</label><input id="filter" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="作品名または映画館名"/>
          <p role="status" className="result-count">{results.length}件 / 上映開始が早い順{hiddenCount>0&&` · 観た作品の${hiddenCount}上映を非表示`}</p>
          {!results.length && <div className="empty">{hiddenCount>0?'条件に合う上映はすべて観た作品です。「観た映画を非表示」をオフにするか、観た登録を解除してください。':data.reason==='freshness'?'最新の確認済み上映データがありません。データ更新後に再検索してください。':
            data.reason==='routing'?'利用できる経路がありません。移動手段を変更するか、経路サービスの設定・対応地域を確認してください。':
            '条件に合う上映がありません。絞り込み・出発地・移動手段・到着余裕を変更して再検索してください。'}</div>}
          <ol className="screenings">{results.map(r=><li className={`screening ${library.watched[r.movieKey]?'is-watched':''}`} data-movie-key={r.movieKey} key={[r.theater.name,r.title,r.screenType,r.subtitle,r.screen,r.startsAt].join('|')}>
            <MovieArtwork key={r.artwork?.url || r.movieKey} artwork={r.artwork} title={r.canonicalTitle || r.title}/>
            <div className="start"><time dateTime={new Date(r.startsAt).toISOString()}>{format(r.startsAt)}</time><span>公式の上映開始</span></div>
            <div className="movie"><div className="movie-heading"><h3>{r.title}</h3><button className="watch-button" aria-pressed={!!library.watched[r.movieKey]} aria-label={`${library.watched[r.movieKey]?'観た登録を解除':'観たに登録'}：${r.canonicalTitle || r.title}`} onClick={()=>library.toggle(r.movieKey,r.canonicalTitle || r.title)}>{library.watched[r.movieKey]?'✓ 観た':'＋ 観た'}</button></div><p>{[r.subtitle,r.screenType,r.screen].filter(Boolean).join(' / ')}</p><h4>{r.theater.name}</h4><p>{r.theater.address}</p>
              <p className={r.route.estimated?'badge estimate':'badge'}>{r.route.estimated?'概算':'経路検索'} 約{Math.ceil(r.route.seconds/60)}分 ・ 到着目安 {format(Math.max(now,r.route.checkedAt)+r.route.seconds*1000)}</p>
              <p className={r.departureAt<now?'notice error':'departure'}><strong>出発期限の目安 {format(r.departureAt)}</strong> ・ {r.departureAt<now?'期限を'+Math.abs(Math.floor((r.departureAt-now)/60000))+'分過ぎました。再検索してください。':'今から'+Math.floor((r.departureAt-now)/60000)+'分以内に出発'}</p>
              <p>本編開始（推定）：{r.featureStartsAt!=null ? format(r.featureStartsAt) : '算出不可'}{r.endsAt!=null && ' ／ 終了予定 '+format(r.endsAt)}{r.runtimeMinutes!=null && ' ／ 本編 '+r.runtimeMinutes+'分'}</p>
              <p className="hint">{r.featureStatus==='estimated'?'公式終了予定 − 同じ上映版の本編尺から算出。予告・休憩・終了予定の誤差を含み、実際の本編開始や遅刻入場を保証しません。':r.featureStatus==='missing_end'?'公式終了時刻を取得できないため、本編開始は推定しません。':r.featureStatus==='missing_runtime'?'同じ上映版の正確な本編尺を取得できないため、本編開始は推定しません。':'終了時刻・本編尺に不整合があるため、本編開始は推定しません。'} 出発期限は必ず公式開始を基準にします。交通状況や電車の発車時刻が変わるため、出発前に経路を再確認してください。</p>
              <p className="hint">{r.route.source} / 上映{margin}分前までに到着する条件</p>
              <div className="links"><a href={directions(r)} target="_blank" rel="noreferrer">経路を確認 ↗</a><a href={r.theater.sourceUrl} target="_blank" rel="noreferrer">上映・空席を公式サイトで確認 ↗</a></div>
              <small>上映情報確認：{format(r.theater.verifiedAt)}。空席・遅延は保証されません。</small>
            </div></li>)}</ol></>}
        </>}
      </section>
    </main>
    <footer><p>作品画像は映画館の公式配信元から読み込みます。画像の出典は各カードに表示しています。</p>tokyo cinema · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · 経路提供：FOSSGIS / Google Maps（設定時） · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">地図を修正</a></footer>
  </div>;
}
