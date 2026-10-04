import type {ReactNode} from "react";
export function PatternStatus({children,tone="neutral"}:{children:ReactNode;tone?:"neutral"|"good"|"warn"|"bad"}){return <span className={`pattern-status ${tone}`}><i/>{children}</span>}
export function PatternName({title,note,avatar=false}:{title:string;note?:string;avatar?:boolean}){return <span className="pattern-name">{avatar&&<span className="pattern-avatar" aria-hidden="true">{title.split(" ").slice(0,2).map(word=>word[0]).join("")}</span>}<span><strong>{title}</strong>{note&&<small>{note}</small>}</span></span>}
export function PatternAmount({value}:{value:number}){return <span className="pattern-number">{new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(value)}</span>}
