import { cookies } from "next/headers";
import type { Actor } from "@/lib/access/types";
import { WorkspaceNavigation, type NavigationSection } from "@/components/WorkspaceNavigation";
import { filterNavigation, navigationManifest } from "@/lib/core/navigation-runtime.mjs";
import { hasCapability } from "@/lib/core/access.mjs";
import { getWorkspaceContext } from "@/lib/auth/server";

export async function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get("oo_theme")?.value === "dark" ? "dark" : "light";
  const workspace = await getWorkspaceContext(actor);
  const showFoundations = actor.demo || hasCapability(actor.access, "admin.permissions.manage");
  const navigationAccess = actor.demo ? {
    ...actor.access,
    capabilities: [...new Set([...actor.access.capabilities, "sales.tender.read", "company.document.read"])],
  } : actor.access;
  const allowed: NavigationSection[] = filterNavigation(navigationManifest, navigationAccess, { showFoundations });
  return <div className="app-shell" data-initial-theme={theme}>
    <script dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=${JSON.stringify(theme)}` }} />
    <WorkspaceNavigation key={`${actor.organizationId}:${actor.membershipId}:${actor.roleCode}:${actor.accessPreview?.roleTemplateId ?? "base"}`} actor={actor} sections={allowed} workspace={workspace}/><main className="main-canvas"><div className="page-wrap">{children}</div></main>
  </div>;
}
