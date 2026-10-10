"use client";
import {useEffect,useRef,useState,useId,type ReactNode,type RefObject} from "react";
import {useSalesEditSession} from "./SalesEditSection";
import {createPortal} from "react-dom";
export function SalesInlineForm({anchor,title,children}:{anchor:RefObject<HTMLElement|null>;title:string;children:ReactNode}){
 const id=useId(),session=useSalesEditSession();const sessionRef=useRef(session);useEffect(()=>{sessionRef.current=session;},[session]);
 const [host,setHost]=useState<HTMLElement|null>(null);const body=useRef<HTMLDivElement>(null);
 useEffect(()=>{const trigger=anchor.current;const section=trigger?.closest('.section');if(!section)return;const owner=sessionRef.current;if(owner&&!owner.open(id))return;const node=document.createElement('div');node.className='sales-inline-host';section.append(node);queueMicrotask(()=>{if(node.isConnected)setHost(node);});return()=>{node.remove();owner?.close(id);trigger?.focus();};},[anchor,id]);
 useEffect(()=>{if(host){body.current?.querySelector<HTMLElement>('input:not([type="hidden"]),select,textarea')?.focus();body.current?.scrollIntoView({block:'nearest',behavior:'smooth'});}},[host]);
 return host?createPortal(<div className="sales-inline-form" ref={body} role="region" aria-label={title}><h3>{title}</h3>{children}</div>,host):null;
}
