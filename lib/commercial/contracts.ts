import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";

export type ContractKind = "master" | "framework" | "specification" | "addendum";
export type ContractStatus = "draft" | "negotiation" | "internal_review" | "approved" | "signing" | "signed" | "rejected" | "terminated" | "expired";
export type LaunchGate = "blocked" | "ready" | "exception";

export type ContractTerms = {
  vatMode?: string | null;
  vatPct?: number | null;
  schedule?: string | null;
  projectDuration?: string | null;
  included?: string[];
  clientProvides?: string[];
  paymentTerms?: string | null;
  paymentDelayDays?: number | null;
  billingBasis?: string | null;
  timesheetRule?: string | null;
  minimumVolume?: string | null;
  sla?: string | null;
  penalties?: string | null;
  notes?: string | null;
  roles?: Array<{ role: string; count: number; rateNet: number; rateGross?: number; unit: string; scenarioId?: string }>;
  proposalSnapshot?: { proposalId: string; proposalVersion: number };
};

export type ContractRow = {
  id: string;
  organizationId: string;
  clientId: string;
  client: string;
  requestId: string;
  request: string;
  proposalId: string | null;
  proposalVersion: number | null;
  objectId: string | null;
  object: string | null;
  parentContractId: string | null;
  parentContract: string | null;
  kind: ContractKind;
  status: ContractStatus;
  title: string;
  number: string | null;
  ownerUserId: string | null;
  owner: string | null;
  launchGate: LaunchGate;
  signedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  version: number;
  updatedAt: string;
};

export type ContractVersionRow = {
  id: string;
  version: number;
  status: string;
  terms: ContractTerms;
  documentReference: string | null;
  createdAt: string;
  createdBy: string;
  signedAt: string | null;
  signedBy: string | null;
};

export type ContractDetail = ContractRow & {
  terms: ContractTerms;
  documentReference: string | null;
  createdAt: string;
  createdBy: string;
  launchExceptionReason: string | null;
  launchExceptionAt: string | null;
  launchExceptionBy: string | null;
  versions: ContractVersionRow[];
  frameworkOptions: Array<{ id: string; label: string }>;
};

const demoContractId = "8f000000-0000-4000-8000-000000000001";

function demoContracts(): ContractRow[] {
  const object = demo.objects[0];
  const request = demo.requests[0];
  const proposal = demo.proposals.find((item) => item.clientId === request.clientId && item.status === "accepted") ?? demo.proposals[0];
  if (!object || !request || !proposal) return [];
  return [{
    id: demoContractId,
    organizationId: request.organizationId,
    clientId: request.clientId!,
    client: request.client,
    requestId: request.id,
    request: request.title,
    proposalId: proposal.id,
    proposalVersion: Number(proposal.version ?? 1),
    objectId: object.id,
    object: object.name,
    parentContractId: null,
    parentContract: null,
    kind: "master",
    status: "signing",
    title: `Договор · ${request.title}`,
    number: null,
    ownerUserId: request.ownerUserId ?? null,
    owner: "Илья Морозов",
    launchGate: "blocked",
    signedAt: null,
    effectiveFrom: null,
    effectiveTo: null,
    version: 1,
    updatedAt: "11.09.2026",
  }];
}

export async function listContracts(actor: Actor): Promise<ContractRow[]> {
  requireCapability(actor, "contract.read");
  if (actor.demo) return demoContracts().filter((row) => canReadRow(actor.access, "contract.read", row, actor));
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<ContractRow[]>`
      SELECT c.id,c.organization_id "organizationId",c.client_company_id "clientId",cl.name client,
        c.request_id "requestId",r.title request,c.proposal_id "proposalId",p.version "proposalVersion",
        c.object_id "objectId",o.name object,c.parent_contract_id "parentContractId",
        CASE WHEN pc.id IS NULL THEN NULL ELSE COALESCE(pc.number,pc.title) END "parentContract",
        c.kind,c.status,c.title,c.number,c.owner_user_id "ownerUserId",u.display_name owner,c.launch_gate "launchGate",
        c.signed_at::text "signedAt",c.effective_from::text "effectiveFrom",c.effective_to::text "effectiveTo",
        COALESCE(cv.version,1)::int version,to_char(c.updated_at,'DD.MM.YYYY') "updatedAt"
      FROM contracts c
      JOIN client_companies cl ON cl.id=c.client_company_id
      JOIN requests r ON r.id=c.request_id
      LEFT JOIN proposals p ON p.id=c.proposal_id
      LEFT JOIN objects o ON o.id=c.object_id
      LEFT JOIN contracts pc ON pc.id=c.parent_contract_id
      LEFT JOIN app_users u ON u.id=c.owner_user_id
      LEFT JOIN contract_versions cv ON cv.id=c.current_version_id
      ORDER BY c.status='signed',c.updated_at DESC
    `;
    return rows.filter((row) => canReadRow(actor.access, "contract.read", row, actor));
  });
}

export async function getContractDetail(actor: Actor, id: string): Promise<ContractDetail | null> {
  const summary = (await listContracts(actor)).find((row) => row.id === id);
  if (!summary) return null;
  if (actor.demo) {
    const proposal = demo.proposals.find((item) => item.id === summary.proposalId);
    const request = demo.requests.find((item) => item.id === summary.requestId);
    return {
      ...summary,
      terms: {
        vatMode: request?.vat ?? "С НДС",
        schedule: typeof request?.schedule === "string" ? request.schedule : null,
        projectDuration: null,
        included: ["Организация выхода персонала", "Координация работы"],
        clientProvides: [],
        paymentTerms: "Оплата по фактически подтверждённым объёмам",
        paymentDelayDays: 30,
        billingBasis: "Подписанный табель / акт",
        timesheetRule: "Ежемесячная сверка с заказчиком",
        minimumVolume: null,
        sla: null,
        penalties: null,
        notes: "Демо-контур договорной работы.",
        proposalSnapshot: proposal ? { proposalId: proposal.id, proposalVersion: Number(proposal.version ?? 1) } : undefined,
      },
      documentReference: null,
      createdAt: "11.09.2026",
      createdBy: "Илья Морозов",
      launchExceptionReason: null,
      launchExceptionAt: null,
      launchExceptionBy: null,
      versions: [{id:"demo-contract-v1",version:1,status:"draft",terms:{paymentTerms:"Оплата по фактически подтверждённым объёмам",paymentDelayDays:30},documentReference:null,createdAt:"11.09.2026",createdBy:"Илья Морозов",signedAt:null,signedBy:null}],
      frameworkOptions: [],
    };
  }
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [current] = await sql<Array<{
      terms: ContractTerms; documentReference:string|null; createdAt:string; createdBy:string;
      launchExceptionReason:string|null; launchExceptionAt:string|null; launchExceptionBy:string|null;
    }>>`
      SELECT cv.terms_snapshot terms,cv.document_reference "documentReference",
        to_char(c.created_at,'DD.MM.YYYY') "createdAt",creator.display_name "createdBy",
        c.launch_exception_reason "launchExceptionReason",c.launch_exception_at::text "launchExceptionAt",exception_user.display_name "launchExceptionBy"
      FROM contracts c
      LEFT JOIN contract_versions cv ON cv.id=c.current_version_id
      JOIN app_users creator ON creator.id=c.created_by_user_id
      LEFT JOIN app_users exception_user ON exception_user.id=c.launch_exception_by_user_id
      WHERE c.id=${id}::uuid
    `;
    if (!current) return null;
    const versions = await sql<ContractVersionRow[]>`
      SELECT cv.id,cv.version,cv.status,cv.terms_snapshot terms,cv.document_reference "documentReference",
        to_char(cv.created_at,'DD.MM.YYYY HH24:MI') "createdAt",creator.display_name "createdBy",
        cv.signed_at::text "signedAt",signer.display_name "signedBy"
      FROM contract_versions cv JOIN app_users creator ON creator.id=cv.created_by_user_id
      LEFT JOIN app_users signer ON signer.id=cv.signed_by_user_id
      WHERE cv.contract_id=${id}::uuid ORDER BY cv.version DESC
    `;
    const frameworkOptions = await sql<Array<{id:string;label:string}>>`
      SELECT c.id,COALESCE(c.number,c.title)||' · '||cl.name label
      FROM contracts c JOIN client_companies cl ON cl.id=c.client_company_id
      WHERE c.client_company_id=${summary.clientId}::uuid AND c.id<>${id}::uuid AND c.status='signed' AND c.kind IN ('framework','master')
      ORDER BY c.signed_at DESC NULLS LAST,c.updated_at DESC
    `;
    return { ...summary, ...current, versions, frameworkOptions };
  });
}
