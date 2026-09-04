import type { Actor } from "@/lib/access/types";
import { withTenant } from "@/lib/db/client";
import { listCommercialProposals } from "@/lib/commercial/service";
import * as demo from "@/lib/demo/data";

export type ProposalRoleLine = {
  role: string;
  specialtyId?: string;
  count: number;
  rateNet: number;
  rateGross: number;
  unit: string;
  scenarioId: string;
};

export type CommercialProposalContent = {
  requestId?: string;
  title?: string;
  objectName?: string | null;
  company?: string | null;
  clientId?: string | null;
  description?: string | null;
  vatMode?: string | null;
  vatPct?: number | null;
  location?: string | null;
  expectedStartDate?: string | null;
  validUntil?: string | null;
  schedule?: string | null;
  projectDuration?: string | null;
  included?: string[];
  clientProvides?: string[];
  terms?: string | null;
  additionalConditions?: string | null;
  comment?: string | null;
  roles?: ProposalRoleLine[];
};

export type CommercialProposalDetail = Awaited<ReturnType<typeof listCommercialProposals>>[number] & {
  content: CommercialProposalContent;
  clientDecisionNote: string | null;
  sourceObjectId: string | null;
};

export async function getCommercialProposalDetail(actor: Actor, id: string): Promise<CommercialProposalDetail | null> {
  const rows = await listCommercialProposals(actor);
  const summary = rows.find((row) => row.id === id);
  if (!summary) return null;
  if (actor.demo) {
    const request = demo.requests.find((item) => item.id === summary.requestId);
    const scenarios = demo.calculations.filter((item) => item.requestId === summary.requestId && item.status === "accepted");
    return {
      ...summary,
      content: {
        requestId: summary.requestId,
        title: request?.title ?? summary.request,
        objectName: request?.title ?? summary.request,
        company: summary.client,
        description: "Предоставление персонала по согласованной заявке и коммерческим условиям.",
        vatMode: request?.vat ?? "with_vat",
        vatPct: 22,
        location: request?.location ?? null,
        expectedStartDate: request?.start ?? null,
        validUntil: null,
        schedule: typeof request?.schedule === "string" ? request.schedule : null,
        included: ["Организация выхода персонала", "Оперативная замена", "Координация работы"],
        clientProvides: [],
        terms: "Оплата производится по фактически подтверждённому объёму оказанных услуг.",
        additionalConditions: null,
        comment: null,
        roles: scenarios.map((item) => ({
          role: item.role,
          count: request?.roles.find((role) => role.name === item.role)?.count ?? 0,
          rateNet: Number(item.clientRate),
          rateGross: Number(item.clientRate) * 1.22,
          unit: "hour",
          scenarioId: item.id,
        })),
      },
      clientDecisionNote: null,
      sourceObjectId: demo.objects.find((item) => summary.status === "accepted" && item.clientId === summary.clientId)?.id ?? null,
    };
  }
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [extra] = await sql<Array<{content:CommercialProposalContent;clientDecisionNote:string|null;sourceObjectId:string|null}>>`
      SELECT p.content_snapshot content,p.client_decision_note "clientDecisionNote",o.id "sourceObjectId"
      FROM proposals p LEFT JOIN objects o ON o.source_proposal_id=p.id WHERE p.id=${id}::uuid
    `;
    return extra ? { ...summary, ...extra } : null;
  });
}
