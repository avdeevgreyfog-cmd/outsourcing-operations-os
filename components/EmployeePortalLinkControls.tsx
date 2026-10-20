"use client";
import {useEffect,useMemo,useState} from "react";
import {RegistryDrawer} from "@/components/registry/RegistryDrawer";
import {Copy,ExternalLink,Link2,RefreshCw,ShieldOff} from "lucide-react";

export type PortalSection="shifts"|"confirm"|"decline"|"scheduleChanges"|"hours"|"timesheet"|"documents"|"employment"|"workwear"|"contacts"|"objectInfo";
export type PortalConfig={
 managerName:string|null;managerPhone:string|null;contactMethod:string|null;instruction:string;
 timezone:string;validDays:number;autoRevokeOnExit:boolean;sections:Record<PortalSection,boolean>;
};
type Patch=Partial<Omit<PortalConfig,"sections">>&{sections?:Partial<PortalConfig["sections"]>};
type Worker={id:string;name:string;objectId:string|null;object:string|null;specialty:string|null;paidHours:number};
type Link={id:string;workerId:string;objectId:string;status:"active"|"paused"|"revoked"|"expired"|"rotated";lastOpenedAt:string|null;createdAt:string;expiresAt?:string|null;autoRevokeAt?:string|null;createdBy?:string|null;changedBy?:string|null};
type Setting={objectId:string;timezone?:string;managerPhone?:string|null;showEmployeeDocuments?:boolean;showEmployeeWorkwear?:boolean};
type Override={scope:"organization"|"object"|"worker";scopeId:string;config:Patch};
export type LinkPayload={
 organizationId?:string;workers:Worker[];links:Link[];settings:Setting[];
 portalOverrides?:Override[];defaultPortalConfiguration?:PortalConfig;
};
const sections:[PortalSection,string][]=[
 ["shifts","Мои смены и график"],["confirm","Подтверждение выхода"],
 ["decline","Отказ от выхода"],["scheduleChanges","Предложение изменения графика"],
 ["hours","Фактически отработанные часы"],["timesheet","Мой табель"],
 ["documents","Документы (чек-лист)"],["employment","Статус оформления"],
 ["workwear","Спецодежда и СИЗ"],["contacts","Контакты менеджера"],
 ["objectInfo","Информация по объекту"]
];
const defaults:PortalConfig={
 managerName:null,managerPhone:null,contactMethod:null,
 instruction:"Подтверждайте выходы и фактически отработанные часы после смены.",
 timezone:"Europe/Moscow",validDays:30,autoRevokeOnExit:true,
 sections:Object.fromEntries(sections.map(([k])=>[k,true])) as PortalConfig["sections"]
};
function merged(base:PortalConfig,patch?:Patch):PortalConfig{
 return {...base,...patch,sections:{...base.sections,...patch?.sections}};
}
const when=(s?:string|null)=>s?new Date(s).toLocaleString("ru-RU"):"—";
const labels:Record<Link["status"],string>={active:"Активна",paused:"Приостановлена",revoked:"Отозвана",expired:"Истекла",rotated:"Перевыпущена"};
export function EmployeePortalLinkControls({data,objectId,canEdit,demo,onRefresh}:{data:LinkPayload;objectId?:string;canEdit:boolean;demo:boolean;onRefresh:()=>Promise<void>}){
 const [objectChoice,setObjectChoice]=useState(objectId??"");
 const [scope,setScope]=useState<"organization"|"object"|"worker">("object");
 const [workerChoice,setWorkerChoice]=useState("");
 const [editor,setEditor]=useState<Patch>({});
 const [issueWorker,setIssueWorker]=useState<Worker|null>(null);
 const [replace,setReplace]=useState(false);
 const [issueConfig,setIssueConfig]=useState<PortalConfig>(defaults);
 const [expiry,setExpiry]=useState("");
 const [autoRevoke,setAutoRevoke]=useState("");
 const [issuedUrl,setIssuedUrl]=useState("");
 const [shareUrl,setShareUrl]=useState("");
 const [pending,setPending]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const selectedObject=objectId??objectChoice;
 const options=useMemo(()=>[...new Map(data.workers.filter(w=>w.objectId).map(w=>[w.objectId!,w.object??"Объект"])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru")),[data.workers]);
 const people=data.workers.filter(w=>w.objectId===selectedObject);
 const orgId=data.organizationId??"";
 const currentScopeId=scope==="organization"?orgId:scope==="object"?selectedObject:workerChoice;
 const override=(kind:Override["scope"],id:string)=>data.portalOverrides?.find(x=>x.scope===kind&&x.scopeId===id)?.config;
 const objectSettings=(id:string)=>data.settings.find(x=>x.objectId===id);
 const effective=(w?:Worker,object?:string)=>{
   const obj=object??w?.objectId??selectedObject,legacy=objectSettings(obj??"");
   const fallback:Patch={};
   if(legacy?.managerPhone)fallback.managerPhone=legacy.managerPhone;
   if(legacy?.timezone)fallback.timezone=legacy.timezone;
   if(legacy?.showEmployeeDocuments===false||legacy?.showEmployeeWorkwear===false)
     fallback.sections={...(legacy.showEmployeeDocuments===false?{documents:false}:{}),...(legacy.showEmployeeWorkwear===false?{workwear:false}:{})};
   const base=data.defaultPortalConfiguration??defaults;
   return [override("organization",orgId),fallback,override("object",obj??""),w?override("worker",w.id):undefined].reduce((a,p)=>merged(a,p),base);
 };
 const editorWorker=data.workers.find(w=>w.id===workerChoice);
 const inherited=scope==="organization"?(data.defaultPortalConfiguration??defaults):
   scope==="object"?merged(merged(data.defaultPortalConfiguration??defaults,override("organization",orgId)),{
       managerPhone:objectSettings(selectedObject)?.managerPhone??undefined,timezone:objectSettings(selectedObject)?.timezone
   }):effective(editorWorker);
 useEffect(()=>{setEditor(override(scope,currentScopeId)??{});},[scope,currentScopeId,data.portalOverrides]);
 async function post(body:Record<string,unknown>){
   if(demo)throw new Error("В демонстрации серверные изменения отключены");
   const res=await fetch("/api/operations/worker-confirmations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
   const json=await res.json();if(!res.ok)throw new Error(json.error??"Ошибка сохранения");return json;
 }
 async function run(body:Record<string,unknown>,success:string){
   if(pending)return;setPending(true);setError("");setMessage("");
   try{const response=await post(body);setMessage(success);await onRefresh();return response as {path?:string}}catch(e){setError(e instanceof Error?e.message:"Ошибка");return null}finally{setPending(false)}
 }
 function editValue(key:keyof Omit<PortalConfig,"sections">,value:string|number|boolean|null){setEditor(p=>({...p,[key]:value}));}
 function editSection(key:PortalSection,value:"inherit"|"yes"|"no"){
   setEditor(p=>{const next={...p.sections};if(value==="inherit")delete next[key];else next[key]=value==="yes";return {...p,sections:next}});
 }
 function startIssue(w:Worker,rotate=false){
   setIssueWorker(w);setReplace(rotate);setIssueConfig(effective(w));setExpiry("");setAutoRevoke("");setIssuedUrl("");setShareUrl("");setError("");setMessage("");
 }
 async function issue(){
   if(!issueWorker?.objectId)return;
   const resp=await run({action:replace?"rotate":"create",objectId:issueWorker.objectId,workerId:issueWorker.id,
    config:issueConfig,expiresAt:expiry?new Date(expiry+"T23:59:59").toISOString():undefined,
    autoRevokeAt:autoRevoke?new Date(autoRevoke+"T23:59:59").toISOString():undefined},
    "Ссылка выпущена. Она ещё не отправлена сотруднику.");
   if(resp?.path)setIssuedUrl(window.location.origin+resp.path);
 }
 async function copyActive(w:Worker,mode:"copy"|"open"="copy"){
   if(!w.objectId)return;
   const resp=await run({action:"copy",objectId:w.objectId,workerId:w.id},"Ссылка получена. Отправка сотруднику не выполнялась.");
   if(!resp?.path)return;
   const url=window.location.origin+resp.path;
   setShareUrl(url);setIssueWorker(w);setIssuedUrl("");setReplace(false);
   if(mode==="copy")try{await navigator.clipboard.writeText(url);setMessage("Ссылка скопирована. Отправьте её сотруднику.")}catch{setMessage("Скопируйте ссылку из поля ниже.")}
 }
 const relevant=data.workers.filter(w=>(!selectedObject||w.objectId===selectedObject));
 return <div className="employee-portal-link-workspace">
   <div className="worker-confirmation-summary"><span>Персональные ссылки сотрудников</span><span>Активных: <b>{data.links.filter(x=>x.status==="active").length}</b></span></div>
   <p className="worker-confirmation-note">Выдача ссылки не означает отправку сотруднику. Приостановка закрывает доступ временно; отзыв и перевыпуск — окончательно. Ответы и аудит сохраняются.</p>
   {message&&<div role="status" className="worker-confirmation-note">{message}</div>}
   {error&&<div role="alert" className="worker-confirmation-manager-error">{error}</div>}
   <div className="request-table-wrap"><table className="data-table">
     <thead><tr><th>Сотрудник</th><th>Объект</th><th>Ссылка</th><th>Выпущена / кем</th><th>Действует до</th><th>Последнее открытие</th><th>Действия</th></tr></thead>
     <tbody>{relevant.map(w=>{const l=data.links.find(x=>x.workerId===w.id&&x.objectId===w.objectId);
       return <tr key={w.id}><td className="cell-title">{w.name}<span className="cell-sub">{w.specialty??"—"}</span></td>
         <td>{w.object??"—"}</td><td>{l?labels[l.status]:"Не создана"}</td>
         <td>{when(l?.createdAt)}<span className="cell-sub">{l?.changedBy??l?.createdBy??"—"}</span></td>
         <td>{when(l?.expiresAt)}{l?.autoRevokeAt&&<span className="cell-sub">Автоотзыв: {when(l.autoRevokeAt)}</span>}</td>
         <td>{when(l?.lastOpenedAt)}</td>
         <td><div className="worker-confirmation-actions">
           {canEdit&&(!l||["revoked","expired","rotated"].includes(l.status))&&<button type="button" className="button" disabled={pending} onClick={()=>startIssue(w)}><Link2 size={13}/> Создать ссылку</button>}
           {canEdit&&l?.status==="active"&&<><button type="button" className="button" disabled={pending} onClick={()=>void copyActive(w)}><Copy size={13}/> Скопировать</button>
             <button type="button" className="button" disabled={pending} onClick={()=>void run({action:"pause",workerId:w.id,objectId:w.objectId},"Ссылка приостановлена")}>Приостановить</button></>}
           {canEdit&&l?.status==="paused"&&<button type="button" className="button" disabled={pending} onClick={()=>void run({action:"resume",workerId:w.id,objectId:w.objectId},"Доступ возобновлён")}>Возобновить</button>}
           {canEdit&&["active","paused"].includes(l?.status??"")&&<><button type="button" className="button" disabled={pending} onClick={()=>startIssue(w,true)}><RefreshCw size={13}/> Перевыпустить</button>
             <button type="button" className="button" disabled={pending} onClick={()=>{if(window.confirm("Отозвать персональную ссылку без возможности возобновления?"))void run({action:"revoke",workerId:w.id,objectId:w.objectId},"Ссылка отозвана")}}><ShieldOff size={13}/> Отозвать</button></>}
         </div></td></tr>})}</tbody></table>{!relevant.length&&<div className="empty-inline">Для выбранного объекта сотрудники не найдены</div>}</div>
   <section className="worker-confirmation-settings"><div className="section-head"><div><h2>Базовые настройки кабинета</h2><p>Организация → объект → сотрудник → отдельная выпущенная ссылка. Изменение настроек не меняет действующие ссылки.</p></div></div>
     <div className="worker-confirmation-toolbar">
       <label>Уровень <select value={scope} onChange={e=>setScope(e.target.value as typeof scope)}><option value="organization">Организация</option><option value="object">Объект</option><option value="worker">Сотрудник</option></select></label>
       {scope!=="organization"&&<label>Объект <select value={selectedObject} disabled={!!objectId} onChange={e=>{setObjectChoice(e.target.value);setWorkerChoice("")}}><option value="">Выберите объект</option>{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>}
       {scope==="worker"&&<label>Сотрудник <select value={workerChoice} onChange={e=>setWorkerChoice(e.target.value)}><option value="">Выберите сотрудника</option>{people.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
     </div>
     {currentScopeId?<div className="worker-confirmation-configuration">
       <p className="worker-confirmation-note">Пустое поле или «По умолчанию» использует настройки предыдущего уровня. Изменения действуют только для следующих ссылок.</p>
       <div className="worker-confirmation-toolbar">
         {([["managerName","Имя или роль менеджера"],["managerPhone","Рабочий телефон"],["contactMethod","Мессенджер или способ связи"],["instruction","Инструкция сотруднику"],["timezone","Часовой пояс"]] as const).map(([key,label])=>
           <label key={key}>{label} <input value={(editor[key]??"") as string} placeholder={String(inherited[key]??"Не указано (по умолчанию)")} onChange={e=>editValue(key,e.target.value)} style={{minWidth:180}}/></label>)}
         <label>Срок ссылки, дней <input type="number" min={1} max={365} value={editor.validDays??""} placeholder={String(inherited.validDays)} onChange={e=>setEditor(p=>({...p,validDays:e.target.value?Number(e.target.value):undefined}))}/></label>
       </div>
       <div className="worker-confirmation-toolbar">
         <label>Автоотзыв после увольнения <select value={editor.autoRevokeOnExit===undefined?"inherit":editor.autoRevokeOnExit?"yes":"no"} onChange={e=>setEditor(p=>({...p,autoRevokeOnExit:e.target.value==="inherit"?undefined:e.target.value==="yes"}))}><option value="inherit">По умолчанию</option><option value="yes">Включён</option><option value="no">Отключён (доступ всё равно блокируется при увольнении)</option></select></label>
       </div>
       <div className="worker-confirmation-toolbar" style={{alignItems:"start",flexWrap:"wrap"}}>
         {sections.map(([key,label])=><label key={key} style={{minWidth:170}}>{label}<select value={editor.sections?.[key]===undefined?"inherit":editor.sections[key]?"yes":"no"} onChange={e=>editSection(key,e.target.value as "inherit"|"yes"|"no")}>
           <option value="inherit">По умолчанию</option><option value="yes">Показывать</option><option value="no">Скрыть</option>
         </select></label>)}
       </div>
       {scope==="object"&&!effective(undefined,selectedObject).managerPhone&&<p className="worker-confirmation-note">Телефон менеджера не заполнен. Укажите его здесь в поле «Рабочий телефон».</p>}
       <div className="worker-confirmation-toolbar"><button type="button" className="button primary" disabled={!canEdit||pending||demo} onClick={()=>void run({action:"save_portal_configuration",scope,scopeId:currentScopeId,objectId:selectedObject||undefined,config:editor},"Настройки сохранены")}>Сохранить настройки</button>
         <button type="button" className="button" onClick={()=>setEditor({})}>Сбросить исключения в форме</button>
       </div>
     </div>:<p className="worker-confirmation-note">Выберите объект или сотрудника для просмотра настроек. Настройки организации доступны независимо от наличия ссылки.</p>}
   </section>
   {issueWorker&&<RegistryDrawer className="object-form-drawer" title={issuedUrl?"Ссылка успешно создана":replace?"Перевыпуск персональной ссылки":shareUrl?"Действующая персональная ссылка":"Создание персональной ссылки"} onClose={()=>{setIssueWorker(null);setIssuedUrl("");setShareUrl("")}}
     footer={<><button className="button" type="button" onClick={()=>{setIssueWorker(null);setIssuedUrl("");setShareUrl("")}}>Закрыть</button>
       {!issuedUrl&&!shareUrl&&<button className="button primary" type="button" disabled={pending||!canEdit} onClick={()=>void issue()}>{pending?"Создаётся…":replace?"Подтвердить перевыпуск":"Создать ссылку"}</button>}</>}>
     <div className="worker-confirmation-configuration">
       <p><b>{issueWorker.name}</b> · {issueWorker.object??"Объект не указан"} · {issueWorker.specialty??"Специальность не указана"}</p>
       {issuedUrl||shareUrl?<><p role="status">Ссылка доступна. Копирование не означает отправку сотруднику.</p>
         <input aria-label="Персональная ссылка" readOnly value={issuedUrl||shareUrl} style={{width:"100%"}}/>
         <div className="worker-confirmation-actions"><button className="button" onClick={()=>void navigator.clipboard.writeText(issuedUrl||shareUrl).then(()=>setMessage("Ссылка скопирована"),()=>setError("Скопируйте адрес из поля"))}><Copy size={14}/> Скопировать ссылку</button>
         <a className="button" href={issuedUrl||shareUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> Открыть кабинет</a>
         <a className="button" href={(issuedUrl||shareUrl)+"?layout=mobile"} target="_blank" rel="noopener noreferrer">Просмотр на телефоне</a></div>
       </>:<>
         {replace&&<p className="worker-confirmation-note">Старая ссылка будет отозвана, её история останется в системе.</p>}
         <p className="worker-confirmation-note">Дата выпуска: {new Date().toLocaleString("ru-RU")}. Итоговая конфигурация будет сохранена в ссылке и не изменится при будущих правках объекта.</p>
         <div className="worker-confirmation-toolbar">
           <label>Имя/роль менеджера<input value={issueConfig.managerName??""} onChange={e=>setIssueConfig(p=>({...p,managerName:e.target.value||null}))}/></label>
           <label>Рабочий телефон<input value={issueConfig.managerPhone??""} placeholder="+7…" onChange={e=>setIssueConfig(p=>({...p,managerPhone:e.target.value||null}))}/></label>
           <label>Способ связи<input value={issueConfig.contactMethod??""} onChange={e=>setIssueConfig(p=>({...p,contactMethod:e.target.value||null}))}/></label>
           <label>Часовой пояс<input value={issueConfig.timezone} onChange={e=>setIssueConfig(p=>({...p,timezone:e.target.value}))}/></label>
           <label>Срок, дней<input type="number" min={1} max={365} value={issueConfig.validDays} onChange={e=>setIssueConfig(p=>({...p,validDays:Number(e.target.value)}))}/></label>
           <label>Последний день действия (если нужен)<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label>
           <label>Дата дополнительного автоотзыва<input type="date" value={autoRevoke} onChange={e=>setAutoRevoke(e.target.value)}/></label>
         </div>
         <label>Инструкция сотруднику<textarea rows={3} maxLength={2000} value={issueConfig.instruction} onChange={e=>setIssueConfig(p=>({...p,instruction:e.target.value}))}/></label>
         <p className="worker-confirmation-note">Разделы, доступные сотруднику по этой ссылке:</p>
         <div className="worker-confirmation-toolbar" style={{flexWrap:"wrap",alignItems:"start"}}>
           {sections.map(([key,label])=><label key={key}><input type="checkbox" checked={issueConfig.sections[key]} onChange={e=>setIssueConfig(p=>({...p,sections:{...p.sections,[key]:e.target.checked}}))}/> {label}</label>)}
         </div>
       </>}
     </div>
   </RegistryDrawer>}
 </div>;
}
