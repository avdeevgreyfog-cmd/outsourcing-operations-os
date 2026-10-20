import {normalizeRequestIntake,type RequestIntake} from './request-intake';
type Values={fullName:string;phone:string;email:string;telegram:string;whatsapp:string;maxContact:string};
export function updateContactSnapshot(previous:RequestIntake['contact'],values:Values,preserveExtra=true):RequestIntake['contact']{
 const known:Record<string,string>={telegram:values.telegram,whatsapp:values.whatsapp,max:values.maxContact};const seen=new Set<string>();
 const methods=preserveExtra?previous.messengers.flatMap(item=>{if(!(item.type in known))return [item];if(seen.has(item.type))return [item];seen.add(item.type);return known[item.type]?[{...item,value:known[item.type]}]:[];}):[];
 for(const [type,value] of Object.entries(known))if(value&&!seen.has(type))methods.push({type,value});
 return {...previous,name:values.fullName,phone:values.phone,email:values.email,messengerType:'',messenger:'',messengers:methods};
}
export function mergeContactIntake(input:unknown,values:Values,preserveExtra=true):Record<string,unknown>{
 const raw=input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{};
 const previous=raw.contact&&typeof raw.contact==='object'&&!Array.isArray(raw.contact)?raw.contact as Record<string,unknown>:{};
 const normalized=normalizeRequestIntake(raw);
 return {...raw,contact:{...previous,...updateContactSnapshot(normalized.contact,values,preserveExtra)}};
}
