import {requireActor} from "@/lib/auth/server";
import {getCommercialFormOptions} from "@/lib/data/commercial-options";
import {PageHeader} from "@/components/UI";
import {RequestIntakeForm} from "@/components/RequestIntakeForm";

export default async function NewRequestPage(){
 const actor=await requireActor();const options=await getCommercialFormOptions(actor);
 return <><PageHeader eyebrow="Коммерция → Заявки" title="Новая заявка" subtitle="Черновик можно сохранить с неполными данными и дополнить во время разговора. Компания не обязательна." breadcrumbs={[{label:"Коммерция"},{label:"Заявки",href:"/requests"},{label:"Новая заявка"}]}/><RequestIntakeForm options={options} demo={actor.demo}/></>;
}
