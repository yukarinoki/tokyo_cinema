const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const urls=process.argv.slice(2);assert.ok(urls.length);
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  for(const url of urls){
   const http=await fetch(url);assert.equal(http.status,200);
   const status=await fetch(url+'/api/status');assert.equal(status.status,200);
   const page=await browser.newPage({viewport:{width:390,height:844}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);
   assert.equal(await page.evaluate(()=>window.isSecureContext),false);
   await page.getByRole('button',{name:'現在地を使う',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'HTTP接続では現在地を取得できません'}).waitFor();
   await page.getByLabel('駅名・住所・緯度, 経度').fill('35.69092, 139.70026');
   await page.getByRole('button',{name:'場所を検索',exact:true}).click();
   const response=page.waitForResponse(r=>r.url().endsWith('/api/search') && r.request().method()==='POST');
   await page.getByRole('button',{name:'今から間に合う上映を探す',exact:true}).click();
   const searchResponse=await response;assert.equal(searchResponse.status(),200);
   await page.locator('.screening').first().waitFor({timeout:60000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({url,http:200,api:200,search:200,manualCoordinateSearch:true,httpGeolocationFallback:true,results:await page.locator('.screening').count(),browser:'Chrome on palpc; 390px viewport; not an iPhone connectivity test'}));
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

