import type {ReactNode} from "react";
import {Breadcrumbs,type Crumb} from "@/components/UI";

/** One header for operational registries; actions keep their module permissions. */
export function RegistryHeader({title,subtitle,breadcrumbs,actions}:{title:string;subtitle:string;breadcrumbs:Crumb[];actions?:ReactNode}){
  return <div className="operis-registry-heading"><Breadcrumbs items={breadcrumbs}/><header className="operis-registry-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{actions&&<div className="operis-header-actions">{actions}</div>}</header></div>;
}
