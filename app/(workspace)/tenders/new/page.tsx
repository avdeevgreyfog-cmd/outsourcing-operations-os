import Link from "next/link";
import {redirect} from "next/navigation";
import {isGithubPagesDemo} from "@/lib/demo/pages";
import {hasCapability} from "@/lib/core/access.mjs";
import {DemoTenderPreview} from "@/components/sales/DemoTenderPreview";
import {requireActor} from "@/lib/auth/server";
import {requireCapability} from "@/lib/access/server";
import {getTenderOptions} from "@/lib/tenders/service";
import {PageHeader} from "@/components/UI";
import {TenderCreateForm} from "@/components/TenderCreateForm";

export default async function NewTenderPage({searchParams}:{searchParams:Promise<{preview?:string}>}){
  const actor=await requireActor();
  const query=isGithubPagesDemo()?{}:await searchParams;
  if(actor.demo&&query.preview){
    if(!actor.access.capabilities.includes("sales.tender.read")&&!actor.access.denies.includes("sales.tender.read"))actor.access.capabilities.push("sales.tender.read");
    if(!hasCapability(actor.access,"sales.tender.read"))redirect("/tenders");
    return <DemoTenderPreview id={query.preview} canEdit={hasCapability(actor.access,"sales.tender.edit")} expectedScope={`${actor.organizationId}:${actor.membershipId}:${actor.roleCode}`}/>;
  }
  requireCapability(actor,"sales.tender.create");const options=await getTenderOptions(actor);
  return <><PageHeader eyebrow="Коммерция → Тендеры" title="Новый тендер" subtitle="Зарегистрируйте найденную закупку. Полный анализ, документы и экономика заполняются уже в карточке тендера." actions={<Link className="button" href="/tenders">К реестру</Link>} breadcrumbs={[{label:"Тендеры",href:"/tenders"},{label:"Новый тендер"}]}/><div className="request-final-editor-shell request-baseline-editor request-intake-unified"><div className="request-final-editor-main"><TenderCreateForm options={options} demo={actor.demo}/></div></div></>;
}
