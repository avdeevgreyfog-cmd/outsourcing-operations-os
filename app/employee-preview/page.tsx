import {Suspense} from "react";
import {EmployeeManagerPreview} from "@/components/EmployeeManagerPreview";
import "@/app/worker-self.css";
export default function EmployeePreviewPage(){
 return <Suspense fallback={<main className="worker-self"><p>Загрузка предпросмотра…</p></main>}><EmployeeManagerPreview/></Suspense>;
}
