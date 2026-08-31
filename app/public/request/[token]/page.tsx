import { PublicRequestForm } from "@/components/PublicRequestForm";
export default async function PublicRequestPage({params}:{params:Promise<{token:string}>}){const {token}=await params;return <PublicRequestForm token={token}/>;}
