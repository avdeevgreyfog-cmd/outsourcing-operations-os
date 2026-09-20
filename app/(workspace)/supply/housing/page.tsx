import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { HousingWorkspace } from "@/components/HousingWorkspace";
import { getHousingSnapshot, getOperationsReferenceData } from "@/lib/operations/service";
import { isGithubPagesDemo } from "@/lib/demo/pages";

export default async function Housing({searchParams}:{searchParams:Promise<{worker?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const [snapshot,options]=await Promise.all([getHousingSnapshot(actor),getOperationsReferenceData(actor,"supply.housing.read")]);
  return <>
    <PageHeader eyebrow="Операции → Обеспечение" title="Жильё" subtitle="Объекты проживания, вместимость, тарифы, заселения и плановые выезды." breadcrumbs={[{label:"Операции"},{label:"Обеспечение"},{label:"Жильё"}]}/>
    <HousingWorkspace snapshot={snapshot} options={options} canManage={hasCapability(actor.access,"supply.housing.manage")} demo={actor.demo} initialWorkerId={params.worker??null}/>
  </>;
}
