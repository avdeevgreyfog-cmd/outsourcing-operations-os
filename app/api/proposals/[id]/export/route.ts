import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth/server";
import { getCommercialProposalDetail } from "@/lib/commercial/proposal-document";
import { vatModeLabel } from "@/lib/ui/format";

export const runtime = "nodejs";

const unitLabels:Record<string,string>={hour:"час",shift:"смена",unit:"единица",worker_month:"сотрудник / месяц",project_month:"проект / месяц",project_fixed:"проект",mixed:"переменная единица"};

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getCurrentActor();
  if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const url=new URL(request.url);
  const format=url.searchParams.get("format")??"docx";
  if(format!=="docx")return NextResponse.json({error:"Поддерживается формат DOCX. Для PDF используйте печатную версию"},{status:400});
  const proposal=await getCommercialProposalDetail(actor,id);
  if(!proposal)return NextResponse.json({error:"КП не найдено"},{status:404});
  const content=proposal.content;const roles=content.roles??[];

  const paragraphs:string[]=[];
  paragraphs.push(p("OPERIS",true,28));
  paragraphs.push(p(`КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ · v${proposal.version}`,true,22));
  paragraphs.push(p(content.objectName??content.title??proposal.request,true,34));
  if(content.description)paragraphs.push(p(content.description,false,20));
  paragraphs.push(p(`Компания: ${content.company??proposal.client}`));
  paragraphs.push(p(`Локация: ${content.location??"Не указана"}`));
  paragraphs.push(p(`Плановый старт: ${content.expectedStartDate??"По согласованию"}`));
  paragraphs.push(p(`График / объём: ${content.schedule??"По согласованию"}`));
  paragraphs.push(p(`НДС: ${content.vatMode?`${vatModeLabel(content.vatMode)}${content.vatPct?` · ${content.vatPct}%`:""}`:"Не указан"}`));
  paragraphs.push(p(`Срок действия: ${content.validUntil??"До изменения условий"}`));
  paragraphs.push(p("СТОИМОСТЬ УСЛУГ",true,22));
  paragraphs.push(table(
    ["Услуга / позиция","Количество","Без НДС","С НДС","Единица"],
    roles.map(role=>[role.role,String(role.count),money(role.rateNet),money(role.rateGross),unitLabels[role.unit]??role.unit]),
  ));
  if(content.included?.length){paragraphs.push(p("В СТАВКУ ВКЛЮЧЕНО",true,22));content.included.forEach((item,index)=>paragraphs.push(p(`${String(index+1).padStart(2,"0")} · ${item}`)));}
  if(content.clientProvides?.length){paragraphs.push(p("ПРЕДОСТАВЛЯЕТ ЗАКАЗЧИК",true,22));content.clientProvides.forEach((item,index)=>paragraphs.push(p(`${String(index+1).padStart(2,"0")} · ${item}`)));}
  if(content.terms){paragraphs.push(p("УСЛОВИЯ СОТРУДНИЧЕСТВА",true,22));paragraphs.push(p(content.terms));}
  if(content.additionalConditions){paragraphs.push(p("ДОПОЛНИТЕЛЬНЫЕ УСЛОВИЯ",true,22));paragraphs.push(p(content.additionalConditions));}
  if(content.comment){paragraphs.push(p("КОММЕНТАРИЙ",true,22));paragraphs.push(p(content.comment));}
  paragraphs.push(p("Документ содержит только клиентские условия. Внутренняя себестоимость, зарплатная экономика, маржа, внутренние комментарии и правила согласования не экспортируются.",false,16));

  const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const zip=makeZip([
    {name:"[Content_Types].xml",data:Buffer.from(contentTypes,"utf8")},
    {name:"_rels/.rels",data:Buffer.from(rels,"utf8")},
    {name:"word/document.xml",data:Buffer.from(documentXml,"utf8")},
  ]);
  const fileName=`КП-v${proposal.version}-${safeName(content.objectName??proposal.request)}.docx`;
  return new NextResponse(new Uint8Array(zip),{headers:{
    "content-type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "content-disposition":`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "cache-control":"private, no-store",
  }});
}

function p(text:string,bold=false,size=20){
  const rPr=`<w:rPr>${bold?"<w:b/>":""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
  return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r>${rPr}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
}
function table(headers:string[],rows:string[][]){
  const cell=(value:string,bold=false)=>`<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:r><w:rPr>${bold?"<w:b/>":""}<w:sz w:val="18"/></w:rPr><w:t>${xml(value)}</w:t></w:r></w:p></w:tc>`;
  const borders=`<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D9DDE2"/><w:left w:val="single" w:sz="4" w:color="D9DDE2"/><w:bottom w:val="single" w:sz="4" w:color="D9DDE2"/><w:right w:val="single" w:sz="4" w:color="D9DDE2"/><w:insideH w:val="single" w:sz="4" w:color="E5E8EB"/><w:insideV w:val="single" w:sz="4" w:color="E5E8EB"/></w:tblBorders>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr><w:tr>${headers.map(h=>cell(h,true)).join("")}</w:tr>${rows.map(row=>`<w:tr>${row.map(value=>cell(value)).join("")}</w:tr>`).join("")}</w:tbl>`;
}
function xml(value:string){return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");}
function money(value:number){return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:2}).format(Number(value??0));}
function safeName(value:string){return value.replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g," ").trim().slice(0,80)||"предложение";}

type ZipEntry={name:string;data:Buffer};
function makeZip(entries:ZipEntry[]){
  const locals:Buffer[]=[];const centrals:Buffer[]=[];let offset=0;
  for(const entry of entries){
    const name=Buffer.from(entry.name,"utf8");const crc=crc32(entry.data);const flags=0x0800;
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(flags,6);local.writeUInt16LE(0,8);local.writeUInt16LE(0,10);local.writeUInt16LE(0,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(entry.data.length,18);local.writeUInt32LE(entry.data.length,22);local.writeUInt16LE(name.length,26);local.writeUInt16LE(0,28);
    locals.push(local,name,entry.data);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(flags,8);central.writeUInt16LE(0,10);central.writeUInt16LE(0,12);central.writeUInt16LE(0,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(entry.data.length,20);central.writeUInt32LE(entry.data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(0,30);central.writeUInt16LE(0,32);central.writeUInt16LE(0,34);central.writeUInt16LE(0,36);central.writeUInt32LE(0,38);central.writeUInt32LE(offset,42);
    centrals.push(central,name);offset+=local.length+name.length+entry.data.length;
  }
  const centralSize=centrals.reduce((sum,item)=>sum+item.length,0);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(0,20);
  return Buffer.concat([...locals,...centrals,end]);
}
const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}return table;})();
function crc32(buffer:Buffer){let c=0xffffffff;for(const byte of buffer)c=crcTable[(c^byte)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
