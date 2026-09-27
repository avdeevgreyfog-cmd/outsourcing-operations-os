import { NextResponse } from "next/server";
import type { Actor } from "@/lib/access/types";
import { loadEffectiveAccess } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { getWorkspaceContext } from "@/lib/auth/server";
import { getCommandCenter } from "@/lib/data/service";
import { hasCapability } from "@/lib/core/access.mjs";

const ORG="00000000-0000-4000-8000-000000000002";
const USER="10000000-0000-4000-8000-000000000101";
const MEMBERSHIP="50000000-0000-4000-8000-000000000101";

export async function GET(){
  const stages:Record<string,unknown>={};
  try{
    const actor=await withTenant(ORG,USER,async(tx)=>{
      stages.tenant=true;
      const [row]=await tx<{
        membership_id:string;user_id:string;organization_id:string;organization_name:string;organization_slug:string;
        display_name:string;email:string;role_template_id:string;role_code:string;role_name:string;
        primary_team_id:string|null;position_id:string|null;position_name:string|null;primary_org_unit_id:string|null;
      }[]>`
        SELECT m.id membership_id,u.id user_id,m.organization_id,o.name organization_name,o.slug organization_slug,
               u.display_name,u.email,r.id role_template_id,r.code role_code,r.name role_name,m.primary_team_id,
               m.position_id,p.name position_name,m.primary_org_unit_id
        FROM organization_memberships m
        JOIN app_users u ON u.id=m.user_id
        JOIN organizations o ON o.id=m.organization_id
        JOIN role_templates r ON r.id=m.role_template_id
        LEFT JOIN positions p ON p.id=m.position_id
        WHERE m.id=${MEMBERSHIP}::uuid AND m.user_id=${USER}::uuid AND m.organization_id=${ORG}::uuid AND m.status='active'
        LIMIT 1
      `;
      if(!row) throw new Error("membership_missing");
      stages.membership=true;
      const teams=await tx<{team_id:string}[]>`SELECT team_id FROM membership_teams WHERE membership_id=${MEMBERSHIP}::uuid`;
      const regions=await tx<{region_id:string}[]>`SELECT region_id FROM membership_regions WHERE membership_id=${MEMBERSHIP}::uuid`;
      const seats=await tx<{job_profile_id:string;organization_unit_id:string;region_id:string|null}[]>`
        SELECT DISTINCT sp.job_profile_id,sp.organization_unit_id,COALESCE(sp.region_id,ou.region_id) region_id
        FROM position_assignments pa
        JOIN staff_positions sp ON sp.id=pa.staff_position_id
        JOIN organization_units ou ON ou.id=sp.organization_unit_id
        WHERE pa.membership_id=${MEMBERSHIP}::uuid
          AND pa.status<>'ended'
          AND pa.effective_from<=current_date
          AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)
          AND sp.effective_from<=current_date
          AND (sp.effective_to IS NULL OR sp.effective_to>=current_date)
      `;
      const units=await tx<{organization_unit_id:string}[]>`
        SELECT organization_unit_id FROM membership_organization_units
        WHERE membership_id=${MEMBERSHIP}::uuid
          AND effective_from<=current_date
          AND (effective_to IS NULL OR effective_to>=current_date)
      `;
      const teamIds=[...new Set([row.primary_team_id,...teams.map(x=>x.team_id)].filter(Boolean) as string[])];
      const regionIds=[...new Set([...regions.map(x=>x.region_id),...seats.map(x=>x.region_id)].filter(Boolean) as string[])];
      const orgUnitIds=[...new Set([row.primary_org_unit_id,...units.map(x=>x.organization_unit_id),...seats.map(x=>x.organization_unit_id)].filter(Boolean) as string[])];
      const positionIds=[...new Set([row.position_id,...seats.map(x=>x.job_profile_id)].filter(Boolean) as string[])];
      stages.assignments=true;
      const access=await loadEffectiveAccess(tx,row.membership_id,row.role_template_id,positionIds,regionIds,orgUnitIds);
      stages.access=true;
      return {
        userId:row.user_id,organizationId:row.organization_id,organizationName:row.organization_name,organizationSlug:row.organization_slug,
        membershipId:row.membership_id,displayName:row.display_name,email:row.email,roleCode:row.role_code,roleName:row.role_name,
        baseRoleCode:row.role_code,baseRoleName:row.role_name,positionId:row.position_id,positionName:row.position_name,
        teamIds,orgUnitIds,regionIds,access,accessPreview:null,
        canAccessPreview:hasCapability(access,"admin.permissions.manage")||hasCapability(access,"organization.access.manage"),
        demo:false,
      } satisfies Actor;
    });

    const workspace=await getWorkspaceContext(actor);
    stages.workspace={ok:true,organizations:workspace.organizations.length,previewOptions:workspace.previewOptions.length};
    const center=await getCommandCenter(actor);
    stages.commandCenter={
      ok:true,objects:center.objects.length,tasks:center.tasks.length,needs:center.needs.length,
      candidates:center.candidates.length,requests:center.requests.length,finance:center.finance.length,
    };
    return NextResponse.json({ok:true,stages});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    return NextResponse.json({ok:false,stages,error:message},{status:500});
  }
}
