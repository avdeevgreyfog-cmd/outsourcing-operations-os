import {EmployeeTimesheetScreen} from "@/components/EmployeeTimesheetScreen";
export const dynamic="force-dynamic";
export default async function EmployeeTimesheetPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{layout?:string}>}){
 const {token}=await params;
 const {layout}=await searchParams;
 const previewLayout=layout==="mobile"?"phone":layout==="desktop"?"desktop":undefined;
 return <EmployeeTimesheetScreen token={token} previewLayout={previewLayout}/>;
}
