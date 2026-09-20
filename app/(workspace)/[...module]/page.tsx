import { githubPagesStaticParams } from "@/lib/demo/static-params";
import { isGithubPagesDemo } from "@/lib/demo/pages";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { findFoundationModule } from "@/lib/core/modules.mjs";
import { ModuleFoundationWorkspace, type FoundationModule } from "@/components/ModuleFoundationWorkspace";

export function generateStaticParams(){
  return isGithubPagesDemo() ? githubPagesStaticParams.foundation.map((module)=>({module})) : [];
}

export default async function FoundationPage({ params }: { params: Promise<{ module: string[] }> }) {
  const actor = await requireActor();
  const { module: pathParts } = await params;
  const descriptor = findFoundationModule(pathParts) as FoundationModule | null;
  if (!descriptor) notFound();
  const isPlatformAdmin = hasCapability(actor.access, "admin.permissions.manage");
  const hasModuleAccess = descriptor.capability ? hasCapability(actor.access, descriptor.capability) : false;
  if (!actor.demo && !isPlatformAdmin && !hasModuleAccess) notFound();
  return <ModuleFoundationWorkspace module={descriptor}/>;
}
