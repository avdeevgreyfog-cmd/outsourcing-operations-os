// Calendar activity and creation-cohort outcomes intentionally use different populations.
// Current stage/updatedAt never substitute for a recorded transition.
export const tenderFunnelSteps=[
  ['new','Новые'],['analysis','Анализ'],['participate','Решили участвовать'],
  ['calculation','Расчёт'],['approval','Согласование'],['preparation','Подготовка'],
  ['submitted','Подано'],['awaiting_result','Ожидаем результат'],['won','Выиграно'],
].map(([code,label])=>({code,label}));
const time=value=>value?new Date(value).getTime():NaN;
const numeric=value=>Number.isFinite(Number(value))?Number(value):0;
const ratio=(numerator,denominator)=>denominator>0?Math.round(numerator/denominator*100):null;
const average=values=>values.length?Number((values.reduce((sum,n)=>sum+n,0)/values.length).toFixed(1)):null;
const complete=(rows,field)=>rows.every(row=>Number.isFinite(field==='value'?row.initialPrice:row.headcount));
const weightedRatio=(numerator,denominator,field)=>complete(denominator,field)?ratio(sum(numerator,field),sum(denominator,field)):null;
const sum=(rows,field)=>rows.reduce((total,row)=>total+(field==='value'?numeric(row.initialPrice):field==='headcount'?numeric(row.headcount):1),0);
const emptyDaily=()=>Object.fromEntries(['new','participate','submitted','won','lost'].flatMap(prefix=>['Tenders','Value','Headcount'].map(suffix=>[prefix+suffix,0])));
function grouped(events,end){
  const map=new Map();
  for(const event of events){if(!event.historicalSnapshot&&time(event.createdAt)<=end){const list=map.get(event.tenderId)??[];list.push(event);map.set(event.tenderId,list)}}
  for(const list of map.values())list.sort((a,b)=>time(a.createdAt)-time(b.createdAt));
  return map;
}
export function calculateTenderPeriod(rows,stageHistory,decisionHistory,resultHistory,from,to){
  const start=time(`${from}T00:00:00.000Z`),end=time(`${to}T23:59:59.999Z`);
  const stagesById=grouped(stageHistory,end),decisionsById=grouped(decisionHistory,end),resultsById=grouped(resultHistory,end);
  const cohort=rows.filter(row=>time(row.createdAt)>=start&&time(row.createdAt)<=end);
  const cohortIds=new Set(cohort.map(row=>row.id));
  const uncertainHistoryCount=[...stageHistory,...decisionHistory,...resultHistory].filter(event=>event.historicalSnapshot&&time(event.createdAt)<=end).length;
  const reached=new Map(),outcomes=new Map(),dailyMap=new Map();
  const decisionHours=[],cycleDays=[],submissionLeadHours=[];
  const durations=new Map(tenderFunnelSteps.map(step=>[step.code,[]]));
  const noBidMap=new Map(),lossMap=new Map();
  let cohortWithoutHistory=0;
  const addDaily=(row,prefix,at)=>{
    if(at<start||at>end||!Number.isFinite(at))return;
    const date=new Date(at).toISOString().slice(0,10),point=dailyMap.get(date)??emptyDaily();
    point[prefix+'Tenders']++;point[prefix+'Value']+=numeric(row.initialPrice);point[prefix+'Headcount']+=numeric(row.headcount);
    dailyMap.set(date,point);
  };
  for(const row of rows){
    const first=new Map([['new',time(row.createdAt)]]);
    const events=stagesById.get(row.id)??[],decisions=decisionsById.get(row.id)??[],results=resultsById.get(row.id)??[];
    for(const event of events){
      const code=event.toStage==='clarification'?'analysis':event.toStage;
      if(tenderFunnelSteps.some(step=>step.code===code)&&code!=='won'&&!first.has(code))first.set(code,time(event.createdAt));
    }
    const participate=decisions.find(event=>event.toDecision==='participate');
    if(participate)first.set('participate',time(participate.createdAt));
    if(time(row.submittedAt)<=end)first.set('submitted',Math.min(first.get('submitted')??Infinity,time(row.submittedAt)));
    // Corrections supersede earlier results/decisions; one tender has one outcome as of period end.
    const result=results.at(-1),decision=decisions.at(-1);
    const won=result?.toResult==='won',lost=result?.toResult==='lost',noBid=decision?.toDecision==='no_bid';
    if(won)first.set('won',time(result.createdAt));
    reached.set(row.id,first);outcomes.set(row.id,{won,lost,noBid,result,decision});
    addDaily(row,'new',time(row.createdAt));
    addDaily(row,'participate',first.get('participate'));
    addDaily(row,'submitted',first.get('submitted'));
    if(won||lost)addDaily(row,won?'won':'lost',time(result.createdAt));
    if(!cohortIds.has(row.id))continue;
    if(!events.length&&!decisions.length&&!results.length&&!Number.isFinite(time(row.submittedAt)))cohortWithoutHistory++;
    const bid=decisions.find(event=>['participate','no_bid'].includes(event.toDecision));
    if(bid&&time(bid.createdAt)>=time(row.createdAt))decisionHours.push((time(bid.createdAt)-time(row.createdAt))/3600000);
    if(result&&time(result.createdAt)>=time(row.createdAt))cycleDays.push((time(result.createdAt)-time(row.createdAt))/86400000);
    if(first.has('submitted')&&Number.isFinite(time(row.submissionDeadline)))submissionLeadHours.push((time(row.submissionDeadline)-first.get('submitted'))/3600000);
    for(let index=0;index<tenderFunnelSteps.length-1;index++){
      const code=tenderFunnelSteps[index].code,next=tenderFunnelSteps[index+1].code,entered=first.get(code),advanced=first.get(next);
      if(entered!=null&&advanced!=null&&advanced>=entered)durations.get(code).push((advanced-entered)/3600000);
    }
    for(const [map,include,reason] of [[noBidMap,noBid,decision?.reasonCode],[lossMap,lost,result?.reasonCode]]){
      if(include){const code=reason||'unknown',item=map.get(code)??{tenders:0,value:0,headcount:0};item.tenders++;item.value+=numeric(row.initialPrice);item.headcount+=numeric(row.headcount);map.set(code,item)}
    }
  }
  const has=(row,code)=>reached.get(row.id)?.has(code);
  const wonRows=cohort.filter(row=>outcomes.get(row.id).won),lostRows=cohort.filter(row=>outcomes.get(row.id).lost),resolved=[...wonRows,...lostRows];
  const submitted=cohort.filter(row=>has(row,'submitted'));
  const stages=tenderFunnelSteps.map((step,index)=>{
    const selected=cohort.filter(row=>has(row,step.code));
    const previous=index?cohort.filter(row=>has(row,tenderFunnelSteps[index-1].code)):cohort;
    const advanced=previous.filter(row=>has(row,step.code));
    const next=tenderFunnelSteps[index+1]?.code;
    const gaps=next?selected.filter(row=>!has(row,next)):[];
    const terminal=row=>{const outcome=outcomes.get(row.id);return outcome.lost||outcome.noBid||['won','lost','cancelled','failed','no_bid'].includes(outcome.result?.toResult)};
    return {code:step.code,label:step.label,tenders:sum(selected,'tenders'),value:sum(selected,'value'),headcount:sum(selected,'headcount'),
      shareTenders:ratio(selected.length,cohort.length),shareValue:weightedRatio(selected,cohort,'value'),shareHeadcount:weightedRatio(selected,cohort,'headcount'),
      conversionTenders:ratio(advanced.length,previous.length),conversionValue:weightedRatio(advanced,previous,'value'),conversionHeadcount:weightedRatio(advanced,previous,'headcount'),
      notAdvancedTenders:gaps.length,notAdvancedValue:sum(gaps,'value'),notAdvancedHeadcount:sum(gaps,'headcount'),
      notAdvancedRate:ratio(gaps.length,selected.length),notAdvancedValueRate:weightedRatio(gaps,selected,'value'),notAdvancedHeadcountRate:weightedRatio(gaps,selected,'headcount'),
      pendingTenders:gaps.filter(row=>!terminal(row)).length,lostTenders:gaps.filter(terminal).length,
      avgHours:average(durations.get(step.code)),tenderIds:selected.map(row=>row.id)};
  });
  const metrics={activeTenders:0,participating:0,deadline3d:0,submittedActive:0,awaitingResult:0,attention:0,blockerTenders:0,unassigned:0,
    newTenders:cohort.length,incomingValue:sum(cohort,'value'),incomingHeadcount:sum(cohort,'headcount'),
    submittedTenders:submitted.length,submittedValue:sum(submitted,'value'),submittedHeadcount:sum(submitted,'headcount'),
    wonTenders:wonRows.length,wonValue:sum(wonRows,'value'),wonHeadcount:sum(wonRows,'headcount'),
    winRateTenders:ratio(wonRows.length,resolved.length),winRateValue:weightedRatio(wonRows,resolved,'value'),winRateHeadcount:weightedRatio(wonRows,resolved,'headcount'),
    avgDecisionHours:average(decisionHours),avgCycleDays:average(cycleDays),avgSubmissionLeadHours:average(submissionLeadHours),
    lostCount:lostRows.length,noBidCount:cohort.filter(row=>outcomes.get(row.id).noBid).length};
  const weightedValidity=new Map();
  for(const row of rows){const outcome=outcomes.get(row.id);if(!outcome.won&&!outcome.lost)continue;const at=time(outcome.result.createdAt);if(at<start||at>end)continue;const date=new Date(at).toISOString().slice(0,10),valid=weightedValidity.get(date)??{value:true,headcount:true};valid.value&&=Number.isFinite(row.initialPrice);valid.headcount&&=Number.isFinite(row.headcount);weightedValidity.set(date,valid)}
  const daily=[];let validValue=true,validHeadcount=true;let cumWon=0,cumLost=0,cumWonValue=0,cumLostValue=0,cumWonHead=0,cumLostHead=0;
  for(let day=start;day<=end;day+=86400000){
    const date=new Date(day).toISOString().slice(0,10),point=dailyMap.get(date)??emptyDaily();
    const valid=weightedValidity.get(date);validValue&&=valid?.value??true;validHeadcount&&=valid?.headcount??true;
    cumWon+=point.wonTenders;cumLost+=point.lostTenders;cumWonValue+=point.wonValue;cumLostValue+=point.lostValue;cumWonHead+=point.wonHeadcount;cumLostHead+=point.lostHeadcount;
    daily.push({date,label:new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(day)),...point,
      winRateTenders:ratio(cumWon,cumWon+cumLost),winRateValue:validValue?ratio(cumWonValue,cumWonValue+cumLostValue):null,winRateHeadcount:validHeadcount?ratio(cumWonHead,cumWonHead+cumLostHead):null});
  }
  const breakdown=kind=>{
    const map=new Map();
    for(const row of cohort){
      const key=(kind==='platforms'?row.platform:kind==='customers'?row.customer:row.ownerUserId)||'none';
      const label=(kind==='platforms'?row.platform:kind==='customers'?row.customer:row.owner)||(kind==='platforms'?'Площадка не указана':kind==='customers'?'Заказчик не указан':'Без ответственного');
      const list=map.get(key)??{key,label,rows:[]};list.rows.push(row);map.set(key,list);
    }
    return [...map.values()].map(({key,label,rows:items})=>{
      const bid=items.filter(row=>has(row,'submitted')),wins=items.filter(row=>outcomes.get(row.id).won),done=items.filter(row=>outcomes.get(row.id).won||outcomes.get(row.id).lost);
      return {key,label,tenders:items.length,value:sum(items,'value'),headcount:sum(items,'headcount'),submitted:bid.length,submittedValue:sum(bid,'value'),submittedHeadcount:sum(bid,'headcount'),won:wins.length,wonValue:sum(wins,'value'),wonHeadcount:sum(wins,'headcount'),resolved:done.length,resolvedValue:sum(done,'value'),resolvedHeadcount:sum(done,'headcount'),winRateTenders:ratio(wins.length,done.length),winRateValue:weightedRatio(wins,done,'value'),winRateHeadcount:weightedRatio(wins,done,'headcount')};
    }).sort((a,b)=>b.won-a.won||b.tenders-a.tenders);
  };
  return {stages,metrics,daily,breakdowns:{platforms:breakdown('platforms'),customers:breakdown('customers'),owners:breakdown('owners')},noBidMap,lossMap,cohortWithoutHistory,uncertainHistoryCount};
}
