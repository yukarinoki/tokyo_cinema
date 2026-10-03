const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const Module=require('node:module');
const path=require('node:path');
const file=path.resolve(__dirname,'../src/timing.ts');
const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const loaded=new Module(file,module);loaded._compile(compiled,file);
const {duration,relativeTime,screeningClock}=loaded.exports;
test('remaining time handles zero, 59, 60 minutes, hours and passed deadlines',()=>{
 const now=Date.parse('2026-10-03T14:30:00Z');
 assert.equal(duration(0),'0分');assert.equal(duration(59),'59分');assert.equal(duration(60),'1時間0分');assert.equal(duration(246),'4時間6分');
 assert.equal(relativeTime(now,now),'今');assert.equal(relativeTime(now+59000,now),'あと1分未満');
 assert.equal(relativeTime(now+59*60000,now),'あと59分');assert.equal(relativeTime(now+60*60000,now),'あと1時間0分');
 assert.equal(relativeTime(now-1,now),'期限超過（1分未満）');assert.equal(relativeTime(now-61*60000,now),'期限超過（1時間1分）');
});
test('JST clock includes dates across midnight and updates remaining minutes',()=>{
 const now=Date.parse('2026-10-03T14:30:00Z'),target=now+3600000;
 assert.equal(screeningClock(now,now),'23:30');assert.equal(screeningClock(target,now),'10/4 00:30');
 assert.equal(screeningClock(target,target),'00:30');assert.equal(relativeTime(target,now+60000),'あと59分');
});
