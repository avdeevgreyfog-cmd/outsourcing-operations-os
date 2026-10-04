/** @param {{channel:string,value:string}} contact */
export function workerContactLink({channel,value}){
 const text=value.trim();
 if(channel==="phone"&&/^\+?[\d\s()\-]{7,60}$/.test(text))return "tel:"+text.replace(/[^+\d]/g,"");
 if(channel==="email"&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))return "mailto:"+encodeURIComponent(text);
 if(channel==="whatsapp"&&/^\+?[\d\s()\-]{7,60}$/.test(text))return "https://wa.me/"+text.replace(/\D/g,"");
 if(channel==="telegram"&&/^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(text))return "https://t.me/"+text.replace(/^@/,"");
 try{const url=new URL(text);if(url.protocol!=="https:"||url.username||url.password)return null;if(channel==="telegram"&&url.hostname==="t.me")return url.href;if(channel==="max"&&["max.ru","web.max.ru"].includes(url.hostname))return url.href;}catch{}
 return null;
}
