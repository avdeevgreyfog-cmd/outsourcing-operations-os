"use client";
import {useEffect} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
/** Compatibility redirect for previous /field deep links: the only working UI is /shifts. */
export default function FormerFieldMode(){
 const router=useRouter();
 useEffect(()=>{router.replace("/shifts")},[router]);
 return <div className="section" style={{padding:"20px"}}><p>Контроль явки доступен в разделе «Смены и выходы».</p><Link href="/shifts" className="button primary">Перейти к сменам</Link></div>;
}