const {test}=require('node:test');
const assert=require('node:assert/strict');
const {screeningTime,tokyoDate,estimate,normalize,reachable,coordinates}=require('./core.cjs');
const now=Date.parse('2026-10-02T14:30:00Z'); // 23:30 JST
const theater=(overrides={})=>({theater_name:'A cinema',latitude:35.69,longitude:139.7,address:'Tokyo',
 schedule_date:'2026-10-02',verified_at:new Date(now).toISOString(),source_url:'https://cinema.example/schedule',
 movies:[{title:'A film',showtimes:[['23:50','26:00'],'24:10','25:10']}],...overrides});
test('Tokyo dates do not depend on host timezone; service-day rollover',()=>{
 assert.equal(tokyoDate(Date.parse('2026-10-02T15:00Z')),'2026-10-03');
 assert.equal(screeningTime('2026-10-02','25:10'),Date.parse('2026-10-03T01:10+09:00'));
 for(const [date,time] of [['2026-02-30','12:00'],['2026-10-02','30:00'],['2026-10-02','12:60'],['bad','10:00']])assert.equal(screeningTime(date,time),null);
});
test('tuple ends are not screenings, duplicate starts collapse; invalid/stale/unverified rejected',()=>{
 const t=theater();t.movies[0].showtimes.push('24:10');
 const data=normalize([t,theater({verified_at:'2025-01-01T00:00Z'}),theater({schedule_date:undefined,scrape_date:'2026-10-02'}),theater({latitude:NaN}),theater({source_url:'javascript:alert(1)'})],now);
 assert.equal(data.rejected,4);assert.equal(data.theaters[0].screenings.length,3);
 assert.ok(!data.theaters[0].screenings.some(s=>s.startsAt===screeningTime('2026-10-02','26:00')));
});
test('strict reachability uses travel + margin, globally sorts across cinemas, filters titles',()=>{
 const data=normalize([theater(),theater({theater_name:'B cinema',movies:[{title:'B film',showtimes:['23:55','23:40']}]})],now).theaters;
 const route={seconds:600,arrivalAt:now+600000,estimated:false};
 const results=reachable(data,[route,route],now,10);
 assert.deepEqual(results.map(r=>r.title),['A film','B film','A film','A film']);
 assert.equal(reachable(data,[route,route],now,11)[0].title,'B film');
 assert.equal(reachable(data,[route,null],now,10,'b film').length,0);
 assert.equal(reachable(data,[route,route],now,10,'B cinema').length,1);
});
test('estimates are explicit and never used for transit',()=>{
 const origin={latitude:35.69,longitude:139.7};
 assert.equal(estimate(origin,theater(),'transit',now),null);
 assert.equal(estimate(origin,theater(),'walk',now).estimated,true);
 assert.ok(!coordinates({latitude:'35',longitude:139}));
});
