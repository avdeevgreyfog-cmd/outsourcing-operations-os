import {requireActor} from "@/lib/auth/server";
import {mobileManagerDesk} from "@/lib/operations/mobile-manager";
import {MobileManagerWorkspace} from "@/components/MobileManagerWorkspace";
import {isGithubPagesDemo} from "@/lib/demo/pages";
export default async function FieldManager({searchParams}:{searchParams:Promise<{date?:string}>}){
 const actor=await requireActor();const params=isGithubPagesDemo()?{}:await searchParams;
 const data=await mobileManagerDesk(actor,params.date);
 return <MobileManagerWorkspace initial={data}/>;
}
