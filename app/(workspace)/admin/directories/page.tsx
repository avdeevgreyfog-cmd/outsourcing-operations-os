import {requireActor} from "@/lib/auth/server";
import {PageHeader} from "@/components/UI";
import {AdminDirectoriesWorkspace} from "@/components/AdminDirectoriesWorkspace";
import {listReferenceDirectories} from "@/lib/admin/reference-directories";

export default async function Directories(){
  const actor=await requireActor();
  const data=await listReferenceDirectories(actor);
  return <>
    <PageHeader eyebrow="Администрирование" title="Справочники" subtitle="Централизованные значения для форм, подбора, объектов и отчётности." breadcrumbs={[{label:"Администрирование"},{label:"Справочники"}]}/>
    <AdminDirectoriesWorkspace regions={data.regions} specialties={data.specialties} demo={actor.demo}/>
  </>;
}
