const DAY=86400000;
export function calculateBooksSummary({today,sessions,books,goalMinutes=30}){
 const start=Date.parse(`${today}T00:00:00Z`)-364*DAY;
 const dailySeconds=Object.fromEntries(Array.from({length:365},(_,index)=>[new Date(start+index*DAY).toISOString().slice(0,10),0]));
 for(const session of sessions??[])if(Object.hasOwn(dailySeconds,session.day))dailySeconds[session.day]+=session.seconds;
 const goalSeconds=goalMinutes*60;let streakDays=0;const offset=(dailySeconds[today]??0)>=goalSeconds?0:1;
 for(let i=offset;i<365;i++){const day=new Date(Date.parse(`${today}T00:00:00Z`)-i*DAY).toISOString().slice(0,10);if((dailySeconds[day]??0)>=goalSeconds)streakDays++;else break;}
 const source=books??[],totalSeconds=Object.values(dailySeconds).reduce((sum,value)=>sum+value,0),pageCount=source.reduce((sum,book)=>sum+(book.book_reading_state?.[0]?.pages_read??0),0);
 return {today,goalMinutes,goalSeconds,todaySeconds:dailySeconds[today]??0,sevenDaySeconds:Object.values(dailySeconds).slice(-7).reduce((a,b)=>a+b,0),dailySeconds,totalBooks:source.length,finishedBooks:source.filter(book=>book.status==='finished'||(book.book_reading_state?.[0]?.position??0)>=0.98).length,pagesPerHour:totalSeconds?Math.round(pageCount*3600/totalSeconds):0,streakDays};
}
