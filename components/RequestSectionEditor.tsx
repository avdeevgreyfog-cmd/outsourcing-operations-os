"use client";
import type {ComponentProps,ReactNode} from "react";
import {RequestPositionAddButton} from "@/components/RequestPositionAddButton";
import {RequestIntakeWorkspacePolished} from "@/components/RequestIntakeWorkspacePolished";
import {SalesEditSection} from "@/components/sales/SalesEditSection";
type Props=ComponentProps<typeof RequestIntakeWorkspacePolished>;
export function RequestSectionEditor({title,note,children,canEdit,...props}:Props&{title:string;note?:string;children:ReactNode;canEdit:boolean}){
  return <SalesEditSection title={title} note={note} canEdit={canEdit} actions={props.section==="need"?<RequestPositionAddButton {...props}/>:undefined} editor={(onSaved,onCancel)=><RequestIntakeWorkspacePolished {...props} onSaved={onSaved} onCancel={onCancel}/>}>{children}</SalesEditSection>;
}
