import {requireActor} from "@/lib/auth/server";
import {mobileManagerDesk} from "@/lib/operations/mobile-manager";
import {MobileManagerWorkspace} from "@/components/MobileManagerWorkspace";
export default async function FieldManager({searchParams}:{searchParams:Promise<{date?:string}>}){
 const actor=await requireActor();const params=await searchParams;
 const data=await mobileManagerDesk(actor,params.date);
 return <MobileManagerWorkspace initial={data}/>;
}
