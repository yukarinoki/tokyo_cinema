const clock = new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const date = new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric'});
const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
export function duration(minutes:number):string {
 const value=Math.max(0,Math.floor(minutes));
 return value>=60?`${Math.floor(value/60)}時間${value%60}分`:`${value}分`;
}
export function relativeTime(target:number,now:number):string {
 const delta=target-now;
 if(delta===0)return '今';
 const span=Math.abs(delta)<60000?'1分未満':duration(Math.floor(Math.abs(delta)/60000));
 return delta<0?`期限超過（${span}）`:`あと${span}`;
}
export function screeningClock(target:number,now:number):string {
 return (day.format(target)!==day.format(now)?date.format(target)+' ':'')+clock.format(target);
}
