"use client";

import {createContext,useContext,useEffect,useId,useRef,useState,type ReactNode} from "react";
import {Pencil} from "lucide-react";
import {Section} from "@/components/UI";

type Session={active:string|null;open:(id:string)=>boolean;close:()=>void};
const EditSession=createContext<Session|null>(null);

export function SalesEditProvider({children}:{children:ReactNode}){
  const [active,setActive]=useState<string|null>(null);
  useEffect(()=>{function navigate(event:MouseEvent){if(event.defaultPrevented)return;const anchor=event.target instanceof Element?event.target.closest("a"):null;if(anchor&&anchor.target!=="_blank"&&!anchor.getAttribute("href")?.startsWith("#"))setActive(null);}document.addEventListener("click",navigate);return()=>document.removeEventListener("click",navigate);},[]);
  return <EditSession.Provider value={{active,open(id){if(active&&active!==id)return false;setActive(id);return true;},close(){setActive(null);}}}>{children}</EditSession.Provider>;
}

export function useUnsavedChanges(dirty:boolean){
  const ref=useRef(dirty);useEffect(()=>{ref.current=dirty;},[dirty]);
  useEffect(()=>{
    function unload(event:BeforeUnloadEvent){if(ref.current){event.preventDefault();event.returnValue="";}}
    function navigate(event:MouseEvent){
      const anchor=event.target instanceof Element?event.target.closest("a"):null;
      if(!ref.current||!anchor||anchor.target==="_blank"||anchor.hasAttribute("download")||anchor.getAttribute("href")?.startsWith("#")||event.ctrlKey||event.metaKey)return;
      if(!window.confirm("Есть несохранённые изменения. Выйти без сохранения?")){event.preventDefault();event.stopPropagation();}
    }
    window.addEventListener("beforeunload",unload);document.addEventListener("click",navigate,true);
    return()=>{window.removeEventListener("beforeunload",unload);document.removeEventListener("click",navigate,true);};
  },[]);
  return ()=>!ref.current||window.confirm("Есть несохранённые изменения. Выйти без сохранения?");
}

export function SalesEditSection({title,note,children,editor,canEdit=true,className}:{title:string;note?:string;children:ReactNode;editor:(done:()=>void,cancel:()=>void)=>ReactNode;canEdit?:boolean;className?:string}){
  const id=useId();const session=useContext(EditSession);const [localOpen,setLocalOpen]=useState(false);const [saved,setSaved]=useState(false);
  const open=session?session.active===id:localOpen;
  const editorRef=useRef<HTMLDivElement>(null),triggerRef=useRef<HTMLButtonElement>(null),wasOpen=useRef(false);
  useEffect(()=>{if(open)editorRef.current?.querySelector<HTMLElement>("input:not([disabled]),select:not([disabled]),textarea:not([disabled])")?.focus();else if(wasOpen.current)triggerRef.current?.focus();wasOpen.current=open;},[open]);
  function close(){session?.close();setLocalOpen(false);}
  return <Section title={title} note={note} className={className} actions={canEdit&&!open?<button type="button" ref={triggerRef} className="button sales-edit-trigger" disabled={Boolean(session?.active&&session.active!==id)} onClick={()=>{if(!session||session.open(id)){setSaved(false);setLocalOpen(true);}}}><Pencil size={14}/>Редактировать</button>:undefined}>
    {open?<div ref={editorRef} className="sales-section-editor">{editor(()=>{setSaved(true);close();},close)}</div>:children}
    {saved&&!open&&<p className="sales-save-feedback" role="status">Изменения сохранены</p>}
  </Section>;
}
