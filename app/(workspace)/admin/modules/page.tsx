import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { getModuleRegistry } from "@/lib/core/modules.mjs";
import { ModuleRegistry, type RegistryItem } from "@/components/ModuleRegistry";

export default async function CompanyModulesPage() {
  const actor = await requireActor();
  if (!actor.demo && !hasCapability(actor.access, "admin.permissions.manage") && !hasCapability(actor.access, "admin.modules.manage")) notFound();
  return <ModuleRegistry items={getModuleRegistry() as RegistryItem[]}/>;
}
