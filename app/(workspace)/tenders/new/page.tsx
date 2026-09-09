import Link from "next/link";
import {requireActor} from "@/lib/auth/server";
import {requireCapability} from "@/lib/access/server";
import {getTenderOptions} from "@/lib/tenders/service";
import {PageHeader} from "@/components/UI";
import {TenderCreateForm} from "@/components/TenderCreateForm";

export default async function NewTenderPage(){
  const actor=await requireActor();requireCapability(actor,"sales.tender.create");const options=await getTenderOptions(actor);
  return <><PageHeader eyebrow="Коммерция → Тендеры" title="Новый тендер" subtitle="Зарегистрируйте найденную закупку. Полный анализ, документы и экономика заполняются уже в карточке тендера." actions={<Link className="button" href="/tenders">К реестру</Link>} breadcrumbs={[{label:"Тендеры",href:"/tenders"},{label:"Новый тендер"}]}/><TenderCreateForm options={options}/></>;
}
