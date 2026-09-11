"use client";

import { useEffect, useLayoutEffect, useMemo, useState, type ComponentProps } from "react";
import { CalculatorWorkspaceOperis } from "@/components/CalculatorWorkspaceOperis";
import type { RateMemoryRow } from "@/lib/commercial/rate-references";
import type { CommercialPolicy } from "@/lib/commercial/commercial-policy";
import { setRuntimeCompanyRules } from "@/lib/commercial/company-rules-client";

const STORAGE_KEY = "operis.rate-memory.v1";
const STORAGE_EVENT = "operis:rate-memory";
type CalculatorProps = ComponentProps<typeof CalculatorWorkspaceOperis>;
type Props = CalculatorProps & { commercialPolicy?: CommercialPolicy };

function loadLocalRows(): RateMemoryRow[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as RateMemoryRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function normalizedUnit(value: string) {
  const unit=value.toLowerCase();
  if (["shift","смена","₽/смену"].includes(unit)) return "shift";
  if (["month","месяц","мес","₽/мес"].includes(unit)) return "month";
  return "hour";
}

export function CalculatorWorkspaceWithRateMemory({ commercialPolicy, ...props }: Props) {
  const [localRows,setLocalRows]=useState<RateMemoryRow[]>([]);

  useLayoutEffect(()=>{
    if(!commercialPolicy)return;
    setRuntimeCompanyRules({
      models:props.context?.models??props.models??[],
      expenses:props.context?.expenseStandards??[],
      schedules:props.context?.scheduleStandards??[],
      commercialPolicy,
    });
    return()=>setRuntimeCompanyRules(null);
  },[commercialPolicy,props.context,props.models]);

  useEffect(()=>{
    if(!props.demo)return;
    const sync=()=>setLocalRows(loadLocalRows());
    const timer=window.setTimeout(sync,0);
    window.addEventListener(STORAGE_EVENT,sync);
    window.addEventListener("storage",sync);
    return()=>{window.clearTimeout(timer);window.removeEventListener(STORAGE_EVENT,sync);window.removeEventListener("storage",sync);};
  },[props.demo]);

  const context=useMemo(()=>{
    if(!props.demo||!props.context||!localRows.length)return props.context;
    return {
      ...props.context,
      roles:props.context.roles.map(role=>{
        const candidates=localRows
          .filter(row=>row.specialty.trim().toLowerCase()===role.specialty.trim().toLowerCase()&&row.amountMin!=null)
          .sort((a,b)=>b.sourceDate.localeCompare(a.sourceDate));
        const latest=candidates[0];
        if(!latest)return role;
        return {...role,reference:{
          id:latest.id,
          amountMin:Number(latest.amountMin),
          amountMax:Number(latest.amountMax??latest.amountMin),
          unit:normalizedUnit(latest.unit),
          paySemantics:/брутто|до вычета|gross/i.test(latest.grossNet)?"gross":"net",
          employmentModel:latest.employmentModel,
          source:latest.source,
          sourceDate:latest.sourceDate,
          confidence:latest.confidence,
        }};
      }),
    };
  },[localRows,props.context,props.demo]);

  return <CalculatorWorkspaceOperis {...props} context={context}/>;
}
