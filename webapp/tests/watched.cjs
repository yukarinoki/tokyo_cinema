const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const KEY='tokyo-cinema:watched:v1';
const ORIGIN='http://localhost:3102';
const ART='https://www.tohotheater.jp/TEST-fixture.svg';
const BADART='https://www.tohotheater.jp/TEST-broken.svg';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#7b3848"/><text x="35" y="190" fill="white">TEST FIXTURE ONLY</text></svg>';
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tokyo-cinema-watched-'));
 const now=Date.now();
 const at=minutes=>{const d=new Date(now+minutes*60000+9*3600000).toISOString();return {date:d.slice(0,10),time:d.slice(11,16)};};
 const artwork=url=>({artwork_url:url,artwork_source_url:'https://www.tohotheater.jp/TEST-source',artwork_policy_url:'https://www.tohotheater.jp/terms/',artwork_permission:'personal-use',artwork_credit:'TEST FIXTURE ONLY'});
 const feed=['A','B','C'].map((suffix,i)=>({theater_name:'TEST Cinema '+suffix,latitude:35.69092,longitude:139.70026,address:'TEST FIXTURE ONLY',source_url:'https://www.tohotheater.jp/TEST-schedule',verified_at:new Date(now).toISOString(),schedule_date:at(60+i*10).date,
  movies:[{title:['TEST Shared Film【字幕】','TEST Shared Film【吹替】','TEST Shared Film【IMAX字幕】'][i],canonical_title:'TEST Shared Film',source_film_id:'TEST-'+suffix,subtitle:i===1?'吹替':'字幕',screen_type:i===2?'IMAX':'',runtime_minutes:110,...(i===0?artwork(ART):i===1?artwork(BADART):{}),showtimes:[[at(60+i*10).time,at(180+i*10).time]]},
   ...(i===0?[{title:'TEST Another Film',showtimes:[[at(100).time,at(220).time]]}]:[])]}));
 const filename=path.join(dir,'feed.json');await fs.writeFile(filename,JSON.stringify(feed));
 const child=spawn(process.execPath,[path.resolve(__dirname,'../server/index.cjs')],{env:{...process.env,PORT:'3102',HOST:'127.0.0.1',DISABLE_PUBLIC_ROUTING:'1',SHOWTIMES_FILE:filename,GOOGLE_ROUTES_API_KEY:'',DISABLE_PERSONAL_ARTWORK:'0'},windowsHide:true,stdio:'pipe'});
 let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const errors=[],unexpected=[];let checks=0,imageRequests=0;
 async function context(options={}){
  const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles',...options});
  await ctx.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(){throw new Error('TEST: actual geolocation must never be called');}}}));
  await ctx.route('**/*',route=>{
   const u=route.request().url();
   if(u===ART){imageRequests++;return route.fulfill({status:200,contentType:'image/svg+xml',body:svg});}
   if(u===BADART){imageRequests++;return route.fulfill({status:404,body:'TEST broken artwork'});}
   if(u.startsWith(ORIGIN+'/'))return route.continue();
   unexpected.push(u);return route.abort();
  });
  ctx.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
  return ctx;
 }
 async function search(page){
  await page.getByRole('button',{name:'新宿駅',exact:true}).click();
  await page.getByLabel('経路が取得できない場合、概算を許可').check();
  await page.locator('.primary').click();
  await page.locator('#filter').waitFor();
 }
 async function count(page,n){await page.waitForFunction(n=>document.querySelectorAll('.screening').length===n,n);}
 try{
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(ORIGIN+'/api/status')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'isolated server ready: '+stderr);
  const ctx=await context();const page=await ctx.newPage();await page.goto(ORIGIN);await search(page);await count(page,4);
  const keys=await page.locator('.screening').evaluateAll(cards=>cards.filter(c=>c.textContent.includes('TEST Shared Film')).map(c=>c.dataset.movieKey));
  assert.equal(new Set(keys).size,1);assert.match(keys[0],/^film-v1:/);checks++;
  const image=page.locator('.film-artwork img').first();
  assert.equal(await image.getAttribute('loading'),'lazy');assert.equal(await image.getAttribute('referrerpolicy'),'no-referrer');
  await image.scrollIntoViewIfNeeded();await page.waitForFunction(()=>{const i=document.querySelector('.film-artwork img');return i&&i.complete&&i.naturalWidth>0;});
  assert.ok(await page.locator('.ambient-light').count()>0);checks++;
  await page.locator('.screening').nth(1).scrollIntoViewIfNeeded();await page.getByText('画像を表示できません',{exact:true}).waitFor();
  assert.ok(await page.getByText('作品画像なし',{exact:true}).count()>0);checks++;
  await page.locator('.screening').first().locator('.watch-button').click();
  assert.equal(await page.locator('.watch-button[aria-pressed="true"]').count(),3);checks++;
  await page.getByLabel('観た映画を非表示',{exact:true}).check();await count(page,1);
  assert.match(await page.locator('.result-count').innerText(),/3上映を非表示/);checks++;
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();await count(page,4);checks++;
  await page.locator('.screening').first().locator('.watch-button').click();await count(page,1);
  await page.reload();assert.equal(await page.getByLabel('観た映画を非表示',{exact:true}).isChecked(),true);await search(page);await count(page,1);
  assert.match(await page.locator('.watch-library summary').innerText(),/1本/);checks++;
  await page.locator('#filter').fill('Shared');await count(page,0);assert.match(await page.locator('.empty').innerText(),/すべて観た作品/);
  await page.locator('.primary').click();await page.locator('#filter').waitFor();await count(page,0);
  assert.equal(await page.locator('#filter').inputValue(),'Shared');checks++;
  await page.getByLabel('観た映画を非表示',{exact:true}).uncheck();await count(page,3);
  await page.locator('.screening').first().locator('.watch-button').click();assert.equal(await page.locator('.watch-button[aria-pressed="true"]').count(),0);checks++;
  await page.locator('#filter').fill('');await count(page,4);
  await page.locator('.screening').first().locator('.watch-button').click();await page.locator('.watch-library summary').click();
  await page.getByRole('button',{name:'TEST Shared Filmの観た登録を解除',exact:true}).click();
  assert.equal(await page.locator('.watch-button[aria-pressed="true"]').count(),0);checks++;
  await fs.mkdir(path.resolve(__dirname,'../test-results'),{recursive:true});
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow at '+width);if(width===390||width===1280)await page.screenshot({path:path.resolve(__dirname,'../test-results/design-fixture-'+(width===390?'mobile':'desktop')+'.png'),fullPage:true});checks++;}
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
  assert.equal(await page.locator('.watch-button').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');checks++;
  await ctx.close();
  for(const broken of ['corrupt','unavailable']){
   const storageCtx=await context();
   await storageCtx.addInitScript(({key,broken})=>{
    if(broken==='corrupt'){if(location.origin==='http://localhost:3102')localStorage.setItem(key,'{broken-json');}
    else{Object.defineProperty(Storage.prototype,'getItem',{configurable:true,value(){throw new DOMException('TEST storage unavailable','SecurityError');}});Object.defineProperty(Storage.prototype,'setItem',{configurable:true,value(){throw new DOMException('TEST storage unavailable','QuotaExceededError');}});}
   },{key:KEY,broken});
   const p=await storageCtx.newPage();await p.goto(ORIGIN);await search(p);await count(p,4);
   if(broken==='unavailable')await p.getByText('このブラウザーに保存できません。',{exact:false}).waitFor();
   await p.locator('.screening').first().locator('.watch-button').click();await p.getByLabel('観た映画を非表示',{exact:true}).check();await count(p,1);
   await p.getByRole('button',{name:'元に戻す',exact:true}).click();await count(p,4);checks++;await storageCtx.close();
  }
  assert.ok(imageRequests>0);assert.deepEqual(unexpected,[],'no live external requests');assert.deepEqual(errors,[]);
  console.log('PASS '+checks+' watched/artwork browser checks; 3 cinema variants, local fixtures, no live API/location requests.');
 }finally{await browser.close();child.kill();await fs.rm(filename,{force:true});await fs.rmdir(dir);}
})().catch(e=>{console.error(e);process.exitCode=1;});
