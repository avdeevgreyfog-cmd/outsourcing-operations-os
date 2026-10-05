export function bucketTenderActivity(rows){
  const size=rows.length<=14?1:rows.length<=45?3:rows.length<=120?7:14;
  const formatter=new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',timeZone:'UTC'});
  const result=[];
  for(let index=0;index<rows.length;index+=size){
    const bucket=rows.slice(index,index+size),first=bucket[0],last=bucket.at(-1);
    const firstLabel=formatter.format(new Date(first.date+'T00:00:00Z')),lastLabel=formatter.format(new Date(last.date+'T00:00:00Z'));
    const point={label:bucket.length===1?firstLabel:`${firstLabel}–${lastLabel}`,dateRange:`${first.date} — ${last.date}`};
    for(const prefix of ['new','participate','submitted','won','lost'])for(const suffix of ['Tenders','Value','Headcount'])point[prefix+suffix]=bucket.reduce((sum,row)=>sum+row[prefix+suffix],0);
    for(const suffix of ['Tenders','Value','Headcount'])point['winRate'+suffix]=last['winRate'+suffix];
    result.push(point);
  }
  return result;
}
export function tenderPercent(value){return value==null?'—':`${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(value)}%`}

const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function tenderActivityTooltip(point,previousPoint,unit,rate=false){
  if(!point)return '';
  const suffix=unit==='tenders'?'Tenders':unit==='value'?'Value':'Headcount';
  const format=value=>new Intl.NumberFormat('ru-RU',unit==='value'?{style:'currency',currency:'RUB',maximumFractionDigits:0}:{maximumFractionDigits:0}).format(value);
  if(rate){
    return `<div>Текущий период · ${escapeHtml(point.dateRange)}<br><strong>${tenderPercent(point['winRate'+suffix])}</strong></div><div>Предыдущий период · ${previousPoint?escapeHtml(previousPoint.dateRange):'нет соответствующего интервала'}<br><strong>${tenderPercent(previousPoint?.['winRate'+suffix])}</strong></div>`;
  }
  return `<strong>${escapeHtml(point.dateRange)}</strong>`+[['new','Новые'],['participate','Решили участвовать'],['submitted','Подано'],['won','Выиграно']].map(([prefix,label])=>`<div>${label}: <strong>${format(point[prefix+suffix])}</strong></div>`).join('');
}
