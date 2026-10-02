const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tokyo-cinema-ui-'));
 const now=Date.now();
 const at=minutes=>{const d=new Date(now+minutes*60000+9*3600000).toISOString();return {date:d.slice(0,10),time:d.slice(11,16)};};
 const feed=[{name:'TEST Cinema A',minutes:90},{name:'TEST Cinema B',minutes:60}].map(({name,minutes})=>({
  theater_name:name,latitude:35.69092,longitude:139.70026,address:'TEST FIXTURE ONLY',
  source_url:'https://example.com',verified_at:new Date(now).toISOString(),schedule_date:at(minutes).date,
  movies:[{title:'TEST Film '+name.slice(-1),showtimes:[[at(minutes).time,at(minutes+120).time]]}]
 }));
 const filename=path.join(dir,'feed.json');await fs.writeFile(filename,JSON.stringify(feed));
 const child=spawn(process.execPath,[path.resolve(__dirname,'../server/index.cjs')],{env:{...process.env,PORT:'3101',DISABLE_PUBLIC_ROUTING:'1',SHOWTIMES_FILE:filename,GOOGLE_ROUTES_API_KEY:''},windowsHide:true,stdio:'pipe'});
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const errors=[];let checks=0;
 const check=()=>checks++;
 try {
  let ready=false;for(let i=0;i<60;i++){try{if((await fetch('http://localhost:3101/api/status')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'test server ready');
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles'});
  await context.addInitScript(()=>{
   Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(_ok,fail){fail({code:1});}}});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3101');
  const disclosure=page.locator('#routing-disclosure');
  assert.match(await disclosure.innerText(),/出発地と映画館の座標を FOSSGIS/);
  assert.match(await disclosure.innerText(),/ログに記録/);
  assert.equal(await disclosure.getByRole('link',{name:'利用条件',exact:true}).getAttribute('href'),'https://routing.openstreetmap.de/about.html');
  assert.equal(await disclosure.getByRole('link',{name:'プライバシー',exact:true}).getAttribute('href'),'https://www.fossgis.de/datenschutzerkl%C3%A4rung');
  assert.ok(await page.evaluate(()=>Boolean(document.querySelector('#routing-disclosure').compareDocumentPosition(document.querySelector('.primary')) & Node.DOCUMENT_POSITION_FOLLOWING)));
  assert.equal(await page.locator('.primary').getAttribute('aria-describedby'),'routing-disclosure');check();
  await page.getByRole('button',{name:'現在地を使う',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'位置情報が許可されていません'}).waitFor();check();
  await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:undefined}));
  await page.getByRole('button',{name:'現在地を使う',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'現在地に対応していません'}).waitFor();check();
  await page.getByRole('button',{name:'新宿駅',exact:true}).click();
  await page.getByLabel('経路が取得できない場合、概算を許可').check();
  await page.getByRole('button',{name:'今から間に合う上映を探す',exact:true}).click();
  await page.locator('.screening').nth(1).waitFor();
  assert.match(await page.locator('.screening').first().innerText(),/TEST Film B/);
  assert.equal(await page.locator('.screening').count(),2);
  assert.match(await page.locator('.badge').first().innerText(),/概算/);check();
  await page.getByLabel('映画・映画館で絞り込み').fill('Cinema A');
  assert.equal(await page.locator('.screening').count(),1);check();
  await page.getByLabel('映画・映画館で絞り込み').fill('NOT FOUND');
  await page.getByText('条件に合う上映がありません。',{exact:false}).waitFor();check();
  await page.getByLabel('映画・映画館で絞り込み').fill('');
  await page.getByRole('radio',{name:'自転車',exact:true}).check();
  assert.equal(await page.locator('.screening').count(),0);
  await page.getByRole('button',{name:'今から間に合う上映を探す',exact:true}).click();
  await page.locator('.screening').nth(1).waitFor();check();
  await page.getByRole('radio',{name:'電車・公共交通',exact:true}).check();
  await page.getByRole('button',{name:'今から間に合う上映を探す',exact:true}).click();
  await page.getByText('利用できる経路がありません。',{exact:false}).waitFor();
  assert.equal(await page.locator('.screening').count(),0);check();
  await page.getByLabel('駅名・住所・緯度, 経度').fill('35.69092, 139.70026');
  await page.getByRole('button',{name:'場所を検索',exact:true}).click();
  await page.getByText('出発地：35.69092, 139.70026',{exact:false}).waitFor();check();
  await page.route('**/api/places?*',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'TEST provider failure'})}));
  await page.getByLabel('駅名・住所・緯度, 経度').fill('Unknown address');
  await page.getByRole('button',{name:'場所を検索',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'主要駅ボタンか緯度'}).waitFor();check();
  await page.getByRole('button',{name:'新宿駅',exact:true}).click();
  await page.getByRole('radio',{name:'徒歩',exact:true}).check();
  await page.route('**/api/search',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'TEST service error'})}));
  await page.getByRole('button',{name:'今から間に合う上映を探す',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'TEST service error'}).waitFor();check();
  await page.unroute('**/api/search');
  // Changing the origin must invalidate a response still in flight.
  await page.route('**/api/search',async route=>{
   await new Promise(r=>setTimeout(r,700));
   try {await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:[],warnings:['OBSOLETE RESPONSE'],searchedAt:Date.now(),checkedTheaters:0,reason:'ok'})});}catch{}
  });
  await page.getByRole('button',{name:'今から間に合う上映を探す',exact:true}).click();
  await page.getByRole('button',{name:'渋谷駅',exact:true}).click();
  await page.waitForTimeout(850);
  assert.equal(await page.getByText('OBSOLETE RESPONSE').count(),0);check();
  await page.unroute('**/api/search');
  await page.getByRole('button',{name:'新宿駅',exact:true}).click();
  await page.getByRole('button',{name:'今から間に合う上映を探す',exact:true}).click();
  await page.locator('.screening').nth(1).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no mobile horizontal overflow');check();
  await fs.mkdir(path.resolve(__dirname,'../test-results'),{recursive:true});
  await page.screenshot({path:path.resolve(__dirname,'../test-results/mobile-fixture.png'),fullPage:true});
  await page.clock.install();await page.clock.fastForward(125000);
  await page.getByText('検索から2分経過しました。',{exact:false}).waitFor();check();
  const real=await browser.newPage({viewport:{width:1280,height:900}});
  await real.goto('http://localhost:3001');
  await real.getByRole('button',{name:'新宿駅',exact:true}).click();
  await real.getByRole('button',{name:'今から間に合う上映を探す',exact:true}).click();
  await real.locator('.screening').first().waitFor({timeout:60000});
  assert.ok((await real.locator('.screening').count())>0);
  assert.match(await real.locator('.badge').first().innerText(),/経路検索/);check();
  await real.screenshot({path:path.resolve(__dirname,'../test-results/preview-current-data.png'),fullPage:false});
  await real.getByRole('radio',{name:'自転車',exact:true}).check();
  await real.getByRole('button',{name:'今から間に合う上映を探す',exact:true}).click();
  await real.locator('.screening').first().waitFor({timeout:60000});
  const times=await real.locator('.screening time').evaluateAll(nodes=>nodes.map(n=>Date.parse(n.dateTime)));
  assert.deepEqual(times,[...times].sort((a,b)=>a-b));
  assert.match(await real.locator('.badge').first().innerText(),/経路検索/);check();
  await real.getByRole('button',{name:'今から間に合う上映を探す',exact:true}).click();
  await real.locator('.screening').first().waitFor({timeout:60000});check();
  assert.deepEqual(errors,[]);
  console.log('PASS '+checks+' browser scenarios; mobile 390px, Pacific browser timezone, real server + isolated fixtures; no page errors.');
 } finally {
  await browser.close();child.kill();await fs.rm(filename,{force:true});await fs.rmdir(dir);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
