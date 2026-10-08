import {EmployeeTimesheetScreen} from "@/components/EmployeeTimesheetScreen";
export const dynamic="force-dynamic";
export default async function EmployeeTimesheetPage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 return <EmployeeTimesheetScreen token={token}/>;
}
