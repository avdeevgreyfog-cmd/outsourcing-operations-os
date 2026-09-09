import { inflateRawSync } from "node:zlib";
import type { Actor } from "@/lib/access/types";
import { withTenant } from "@/lib/db/client";

export type ProposalPriceDisplay = "both" | "gross_only" | "net_only";

export type ProposalTemplateConfig = {
  documentTitle: string;
  intro: string;
  priceDisplay: ProposalPriceDisplay;
  showIncluded: boolean;
  showClientProvides: boolean;
  showTerms: boolean;
  showManager: boolean;
  showCta: boolean;
  cta: string;
  accent: string;
};

export type ProposalTemplateAnalysis = {
  recognized: boolean;
  paragraphCount: number;
  tableCount: number;
  titleCandidate: string | null;
  introCandidate: string | null;
  priceTableIndex: number | null;
  priceColumns: Array<{ source: string; field: string | null }>;
  sectionHeadings: string[];
  contactLines: string[];
  accentCandidate: string | null;
  warnings: string[];
};

export type ProposalTemplateRow = {
  id: string;
  name: string;
  kind: "operis" | "docx";
  version: number;
  status: "active" | "archived";
  isDefault: boolean;
  config: ProposalTemplateConfig;
  analysis: ProposalTemplateAnalysis | Record<string, never>;
  sourceFileName: string | null;
  createdAt: string;
  updatedAt: string;
};

export const defaultProposalTemplateConfig: ProposalTemplateConfig = {
  documentTitle: "Предоставление линейного персонала",
  intro: "Предлагаем ставки на предоставление персонала. Условия объекта, график, численность и дата запуска согласовываются отдельно.",
  priceDisplay: "both",
  showIncluded: false,
  showClientProvides: false,
  showTerms: false,
  showManager: true,
  showCta: true,
  cta: "Готовы приступить к выводу персонала после согласования условий.",
  accent: "#183d34",
};

export function normalizeTemplateConfig(value: unknown): ProposalTemplateConfig {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<ProposalTemplateConfig>;
  return {
    documentTitle: stringOr(raw.documentTitle, defaultProposalTemplateConfig.documentTitle),
    intro: stringOr(raw.intro, defaultProposalTemplateConfig.intro),
    priceDisplay: raw.priceDisplay === "gross_only" || raw.priceDisplay === "net_only" ? raw.priceDisplay : "both",
    showIncluded: raw.showIncluded === true,
    showClientProvides: raw.showClientProvides === true,
    showTerms: raw.showTerms === true,
    showManager: raw.showManager !== false,
    showCta: raw.showCta !== false,
    cta: stringOr(raw.cta, defaultProposalTemplateConfig.cta),
    accent: normalizeAccent(raw.accent),
  };
}

export async function listProposalTemplates(actor: Actor): Promise<ProposalTemplateRow[]> {
  if (actor.demo) return [{
    id: "demo-operis-template", name: "Стандартное КП OPERIS", kind: "operis", version: 1,
    status: "active", isDefault: true, config: defaultProposalTemplateConfig, analysis: {},
    sourceFileName: null, createdAt: "—", updatedAt: "—",
  }];
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<Array<Omit<ProposalTemplateRow,"config"|"analysis"> & {config:unknown;analysis:unknown}>>`
      SELECT id,name,kind,version,status,is_default "isDefault",config_json config,analysis_json analysis,
        source_file_name "sourceFileName",to_char(created_at,'DD.MM.YYYY HH24:MI') "createdAt",
        to_char(updated_at,'DD.MM.YYYY HH24:MI') "updatedAt"
      FROM proposal_templates
      WHERE status='active'
      ORDER BY is_default DESC,updated_at DESC,name
    `;
    return rows.map((row) => ({...row, config: normalizeTemplateConfig(row.config), analysis: (row.analysis ?? {}) as ProposalTemplateAnalysis | Record<string,never>}));
  });
}

export async function getProposalTemplate(actor: Actor, id: string): Promise<ProposalTemplateRow | null> {
  const rows = await listProposalTemplates(actor);
  return rows.find((row) => row.id === id) ?? null;
}

export async function getDefaultProposalTemplate(actor: Actor): Promise<ProposalTemplateRow> {
  const rows = await listProposalTemplates(actor);
  return rows.find((row) => row.isDefault) ?? rows[0] ?? {
    id: "operis-default", name: "Стандартное КП OPERIS", kind: "operis", version: 1, status: "active", isDefault: true,
    config: defaultProposalTemplateConfig, analysis: {}, sourceFileName: null, createdAt: "—", updatedAt: "—",
  };
}

export async function createImportedProposalTemplate(actor: Actor, input: {name:string;fileName:string;docx:Buffer}) {
  const analysis = analyzeProposalDocx(input.docx);
  const config = normalizeTemplateConfig({
    ...defaultProposalTemplateConfig,
    documentTitle: analysis.titleCandidate || defaultProposalTemplateConfig.documentTitle,
    intro: analysis.introCandidate || defaultProposalTemplateConfig.intro,
    accent: analysis.accentCandidate || defaultProposalTemplateConfig.accent,
  });
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql.begin(async (tx) => {
    const [versionRow] = await tx<Array<{version:number}>>`
      SELECT COALESCE(max(version),0)::int+1 version FROM proposal_templates
      WHERE lower(name)=lower(${input.name})
    `;
    const [created] = await tx<Array<{id:string}>>`
      INSERT INTO proposal_templates(organization_id,name,kind,version,status,is_default,config_json,analysis_json,source_file_name,source_docx,created_by_user_id)
      VALUES(${actor.organizationId}::uuid,${input.name},'docx',${versionRow?.version??1},'active',false,
        ${sql.json(config)},${sql.json(analysis)},${input.fileName},${input.docx},${actor.userId}::uuid)
      RETURNING id
    `;
    return {id: created.id, analysis, config};
  }));
}

export async function updateProposalTemplate(actor: Actor, id: string, input: {config?:ProposalTemplateConfig;isDefault?:boolean;status?:"active"|"archived"}) {
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql.begin(async (tx) => {
    const [existing] = await tx<Array<{id:string}>>`SELECT id FROM proposal_templates WHERE id=${id}::uuid FOR UPDATE`;
    if (!existing) throw new Error("Шаблон не найден");
    if (input.isDefault === true) await tx`UPDATE proposal_templates SET is_default=false,updated_at=now() WHERE is_default=true AND id<>${id}::uuid`;
    const [updated] = await tx<Array<{id:string}>>`
      UPDATE proposal_templates SET
        config_json=COALESCE(${input.config ? sql.json(normalizeTemplateConfig(input.config)) : null}::jsonb,config_json),
        is_default=COALESCE(${input.isDefault ?? null}::boolean,is_default),
        status=COALESCE(${input.status ?? null}::text,status),
        updated_at=now()
      WHERE id=${id}::uuid RETURNING id
    `;
    return updated;
  }));
}

export function analyzeProposalDocx(buffer: Buffer): ProposalTemplateAnalysis {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error("Файл не похож на DOCX");
  const documentXml = unzipEntry(buffer, "word/document.xml");
  if (!documentXml) throw new Error("В DOCX не найден основной документ Word");
  const xml = documentXml.toString("utf8");
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => textFromXml(match[0])).filter(Boolean);
  const tables = [...xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)].map((match) => {
    const rows = [...match[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((row) => [...row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cell) => textFromXml(cell[0])));
    return {xml: match[0], rows};
  });
  let priceTableIndex: number | null = null;
  let priceColumns: Array<{source:string;field:string|null}> = [];
  for (let index=0; index<tables.length; index++) {
    const headers = tables[index].rows[0] ?? [];
    const mapped = headers.map((header) => ({source:header,field:mapPriceHeader(header)}));
    const score = mapped.filter((item) => item.field).length;
    if (score >= 2 && (mapped.some((item)=>item.field==="specialty") || mapped.some((item)=>item.field==="rateGross"))) {
      priceTableIndex=index; priceColumns=mapped; break;
    }
  }
  const upper = (value:string) => value.trim().toLocaleUpperCase("ru-RU");
  const sectionHeadings = paragraphs.filter((value) => {
    const normalized=upper(value);
    return ["СТОИМОСТЬ УСЛУГ","В СТАВКУ ВКЛЮЧЕНО","В СТОИМОСТЬ ВКЛЮЧЕНО","ПРЕДОСТАВЛЯЕТ ЗАКАЗЧИК","УСЛОВИЯ СОТРУДНИЧЕСТВА","ДОПОЛНИТЕЛЬНЫЕ УСЛОВИЯ"].some((heading)=>normalized.includes(heading));
  }).slice(0,12);
  const contactLines=paragraphs.filter((value)=>/(телефон|e-?mail|почт|telegram|телеграм|ответственн|менеджер)/i.test(value)).slice(-8);
  const excluded=/коммерческ(ое|ий) предложени|аутсорсинг персонала|стоимость услуг/i;
  const titleCandidate=paragraphs.find((value)=>value.length>=8&&value.length<=100&&!excluded.test(value)&&!mapPriceHeader(value))??null;
  const titleIndex=titleCandidate?paragraphs.indexOf(titleCandidate):-1;
  const introCandidate=paragraphs.slice(Math.max(0,titleIndex+1),Math.max(0,titleIndex+5)).find((value)=>value.length>=35&&!excluded.test(value))??null;
  const fills=[...xml.matchAll(/<w:shd\b[^>]*w:fill="([0-9A-Fa-f]{6})"/g)].map((match)=>match[1].toUpperCase()).filter((value)=>!['FFFFFF','000000','F2F2F2','F5F5F5'].includes(value));
  const accentCandidate=fills[0]?`#${fills[0]}`:null;
  const warnings:string[]=[];
  if(priceTableIndex===null)warnings.push("Не удалось уверенно определить таблицу ставок. Проверьте сопоставление вручную.");
  if(!titleCandidate)warnings.push("Не удалось определить основной заголовок документа.");
  return {recognized:priceTableIndex!==null,paragraphCount:paragraphs.length,tableCount:tables.length,titleCandidate,introCandidate,priceTableIndex,priceColumns,sectionHeadings,contactLines,accentCandidate,warnings};
}

function mapPriceHeader(value:string):string|null {
  const key=value.toLocaleLowerCase("ru-RU").replace(/\s+/g," ").trim();
  if(/специальност|позици|услуг|професси/.test(key))return "specialty";
  if(/кол-?во|количеств|численност/.test(key))return "count";
  if(/единиц|расч[её]т|чел[.\s/]?час|смен/.test(key))return "unit";
  if(/без ндс|нетто/.test(key))return "rateNet";
  if(/с ндс|вкл.*ндс|итог.*став|брутто/.test(key))return "rateGross";
  if(/^ставка$|цена/.test(key))return "rateGross";
  return null;
}

function unzipEntry(buffer:Buffer,target:string):Buffer|null {
  let eocd=-1;
  for(let offset=buffer.length-22;offset>=Math.max(0,buffer.length-65557);offset--){if(buffer.readUInt32LE(offset)===0x06054b50){eocd=offset;break;}}
  if(eocd<0)throw new Error("Повреждённый DOCX: не найден ZIP-каталог");
  const centralOffset=buffer.readUInt32LE(eocd+16);let offset=centralOffset;
  while(offset+46<=buffer.length&&buffer.readUInt32LE(offset)===0x02014b50){
    const method=buffer.readUInt16LE(offset+10);const compressedSize=buffer.readUInt32LE(offset+20);const fileNameLength=buffer.readUInt16LE(offset+28);const extraLength=buffer.readUInt16LE(offset+30);const commentLength=buffer.readUInt16LE(offset+32);const localOffset=buffer.readUInt32LE(offset+42);
    const name=buffer.subarray(offset+46,offset+46+fileNameLength).toString("utf8");
    if(name===target){
      if(buffer.readUInt32LE(localOffset)!==0x04034b50)throw new Error("Повреждённый DOCX: неверная запись ZIP");
      const localNameLength=buffer.readUInt16LE(localOffset+26);const localExtraLength=buffer.readUInt16LE(localOffset+28);const start=localOffset+30+localNameLength+localExtraLength;const compressed=buffer.subarray(start,start+compressedSize);
      if(method===0)return Buffer.from(compressed);if(method===8)return inflateRawSync(compressed);throw new Error("DOCX использует неподдерживаемый метод сжатия");
    }
    offset+=46+fileNameLength+extraLength+commentLength;
  }
  return null;
}

function textFromXml(xml:string){return decodeXml(xml.replace(/<w:tab\s*\/>/g,"\t").replace(/<w:br\s*\/>/g,"\n").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());}
function decodeXml(value:string){return value.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'");}
function stringOr(value:unknown,fallback:string){return typeof value==="string"&&value.trim()?value.trim():fallback;}
function normalizeAccent(value:unknown){return typeof value==="string"&&/^#[0-9a-fA-F]{6}$/.test(value)?value.toUpperCase():defaultProposalTemplateConfig.accent;}
