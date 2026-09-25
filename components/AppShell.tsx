import { Suspense } from "react";
import { cookies } from "next/headers";
import type { Actor } from "@/lib/access/types";
import { WorkspaceNavigation, type NavigationSection } from "@/components/WorkspaceNavigation";
import { filterNavigation, navigationManifest } from "@/lib/core/navigation-runtime.mjs";
import { getWorkspaceContext } from "@/lib/auth/server";
import { isGithubPagesDemo } from "@/lib/demo/pages";

export async function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const staticDemo = isGithubPagesDemo();
  const store = staticDemo ? null : await cookies();
  const theme = store?.get("oo_theme")?.value === "dark" ? "dark" : "light";
  const visualMode = store?.get("oo_ui")?.value === "classic" ? "classic" : "new";
  const workspace = await getWorkspaceContext(actor);
  const showFoundations = process.env.SHOW_FOUNDATIONS === "true";
  const navigationAccess = actor.demo ? {
    ...actor.access,
    capabilities: [...new Set([...actor.access.capabilities, "sales.tender.read", "company.document.read"])],
  } : actor.access;
  const allowed: NavigationSection[] = filterNavigation(navigationManifest, navigationAccess, { showFoundations });
  return <div className="app-shell" data-initial-theme={theme} data-initial-ui={visualMode}>
    <script dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=${JSON.stringify(theme)};try{const saved=localStorage.getItem("operis.visualMode");document.documentElement.dataset.operisUi=(saved==="classic"||saved==="new")?saved:${JSON.stringify(visualMode)}}catch{document.documentElement.dataset.operisUi=${JSON.stringify(visualMode)}}` }} />
    <Suspense fallback={<div className="sidebar"/>}><WorkspaceNavigation key={`${actor.organizationId}:${actor.membershipId}:${actor.roleCode}:${actor.accessPreview?.targetId ?? "base"}`} actor={actor} sections={allowed} workspace={workspace} visualMode={visualMode}/></Suspense><main className="main-canvas"><Suspense fallback={<div className="page-wrap"/>}><div className="page-wrap">{children}</div></Suspense></main>
  </div>;
}
