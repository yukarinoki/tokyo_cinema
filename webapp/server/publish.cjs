// Explicit publication of a verified feed; never relabel old scraper output as current.
const fs=require('node:fs/promises');
const path=require('node:path');
const {normalize}=require('./core.cjs');
(async()=>{
 const source=process.argv[2];
 if(!source) throw new Error('Usage: node server/publish.cjs <verified-feed.json>');
 const raw=await fs.readFile(path.resolve(source),'utf8');
 const data=JSON.parse(raw);
 const checked=normalize(data,Date.now());
 if(checked.rejected || !checked.theaters.length) throw new Error('Feed must contain upcoming screenings with valid coordinates, schedule_date, verified_at and HTTPS source_url. Do not relabel stale data.');
 const target=path.resolve(__dirname,'../public/data/movie_schedules_latest.json');
 await fs.mkdir(path.dirname(target),{recursive:true});
 await fs.writeFile(target+'.tmp',JSON.stringify(data,null,2));
 await fs.rename(target+'.tmp',target);
 console.log('Published '+checked.theaters.length+' verified cinema schedules.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
