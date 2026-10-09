/** Only rank comparable specialty/region entries on the requested economics date. */
export function rankRateReferences(rows, regionId, economicsDate, limit = 4) {
  const valid=rows.filter(row=>row.sourceDate && row.sourceDate<=economicsDate && row.amountMin!=null);
  const quality=row=>{
    let score=0;
    if(regionId&&row.regionId===regionId)score+=100;
    if(["actual","accepted","approved"].includes(row.sourceStatus))score+=20;
    if(["object","proposal"].includes(row.sourceType))score+=5;
    if(row.paySemantics==="net")score+=2;
    const days=(Date.parse(economicsDate+"T00:00:00Z")-Date.parse(row.sourceDate+"T00:00:00Z"))/86400000;
    if(Number.isFinite(days)&&days<=180)score+=10;
    return score;
  };
  return [...valid].sort((a,b)=>quality(b)-quality(a)||b.sourceDate.localeCompare(a.sourceDate)||String(a.id).localeCompare(String(b.id)))
    .slice(0,Math.max(0,limit));
}
