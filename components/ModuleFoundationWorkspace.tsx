import Link from "next/link";
import { Empty, PageHeader } from "@/components/UI";

export type FoundationModule = {
  id: string;
  label: string;
  href: string;
  capability?: string;
  sectionLabel: string;
  groupLabel: string;
  purpose: string;
  workflow: string[];
  views: string[];
  fields: string[];
  relations: string[];
  next: string[];
};

export function ModuleFoundationWorkspace({ module }: { module: FoundationModule }) {
  return <>
    <PageHeader
      eyebrow={module.sectionLabel}
      title={module.label}
      breadcrumbs={[{ label: module.sectionLabel }, { label: module.label }]}
      actions={<Link className="button" href="/">На рабочий стол</Link>}
    />
    <Empty title="Раздел готовится" text="Этот раздел пока недоступен для работы. Когда он будет готов, он появится в меню."/>
  </>;
}
