function numberOrNull(value){
  if(value===null||value===undefined||value==="")return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function roundMoney(value){
  return Math.round((Number(value)+Number.EPSILON)*100)/100;
}

export function validateTenderLaunchPricing({bidValue,priceVatMode,roles,tolerance=1}){
  const missing=[];
  const bid=numberOrNull(bidValue);
  if(bid==null||bid<=0)missing.push("Не зафиксирована финальная цена тендера");
  if(!["with_vat","without_vat","not_applicable"].includes(priceVatMode)){
    missing.push("Не определён режим НДС финальной цены");
  }
  if(!Array.isArray(roles)||roles.length===0)missing.push("В тендере нет позиций для запуска");

  let scenarioRevenueNet=0;
  const vatValues=[];
  for(const role of roles??[]){
    const title=String(role.title??"Позиция");
    const volume=numberOrNull(role.volume);
    const rate=numberOrNull(role.clientRateNet);
    const roleUnit=String(role.roleBillingUnit??"unknown");
    const scenarioUnit=String(role.scenarioBillingUnit??role.billingUnit??roleUnit);
    const vatPct=numberOrNull(role.vatPct);

    if(volume==null||volume<=0)missing.push(`Не указан финальный объём позиции «${title}»`);
    if(rate==null||rate<=0)missing.push(`Не указана финальная ставка позиции «${title}»`);
    if(roleUnit==="unknown"||roleUnit==="mixed")missing.push(`Тарификация позиции «${title}» не позволяет сверить финальную цену автоматически`);
    if(scenarioUnit==="unknown"||scenarioUnit==="mixed")missing.push(`Финальный сценарий позиции «${title}» не имеет однозначной единицы тарификации`);
    if(roleUnit!=="unknown"&&scenarioUnit!=="unknown"&&roleUnit!=="mixed"&&scenarioUnit!=="mixed"&&roleUnit!==scenarioUnit){
      missing.push(`Единица финального сценария не совпадает с тендерной позицией «${title}»`);
    }
    if(vatPct!=null)vatValues.push(vatPct);
    if(volume!=null&&volume>0&&rate!=null&&rate>0)scenarioRevenueNet+=volume*rate;
  }

  let vatPct=null;
  let winningRevenueNet=null;
  if(bid!=null&&bid>0){
    if(priceVatMode==="without_vat"||priceVatMode==="not_applicable"){
      winningRevenueNet=bid;
      vatPct=priceVatMode==="not_applicable"?0:null;
    }else if(priceVatMode==="with_vat"){
      if(vatValues.length!==(roles??[]).length){
        missing.push("Не во всех финальных сценариях зафиксирован НДС");
      }else{
        const unique=[...new Set(vatValues.map(value=>roundMoney(value)))];
        if(unique.length!==1)missing.push("В финальных сценариях используются разные ставки НДС");
        else{
          vatPct=unique[0];
          winningRevenueNet=bid/(1+Number(vatPct)/100);
        }
      }
    }
  }

  const calculatedRevenueNet=roundMoney(scenarioRevenueNet);
  const expectedRevenueNet=winningRevenueNet==null?null:roundMoney(winningRevenueNet);
  const differenceNet=expectedRevenueNet==null?null:roundMoney(calculatedRevenueNet-expectedRevenueNet);
  if(missing.length===0&&differenceNet!=null&&Math.abs(differenceNet)>tolerance){
    missing.push(`Финальные ставки расчёта не совпадают с ценой победы: отклонение ${new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:2}).format(differenceNet)}`);
  }

  return {
    status:missing.length?"mismatch":"aligned",
    winningRevenueNet:expectedRevenueNet,
    scenarioRevenueNet:calculatedRevenueNet,
    differenceNet,
    vatPct,
    missing:[...new Set(missing)],
  };
}
