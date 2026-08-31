import { cookies } from "next/headers";
import type { Actor } from "@/lib/access/types";
import { WorkspaceNavigation, type NavigationSection } from "@/components/WorkspaceNavigation";
import { filterNavigation, navigationManifest } from "@/lib/core/navigation.mjs";
import { hasCapability } from "@/lib/core/access.mjs";

export async function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get("oo_theme")?.value === "dark" ? "dark" : "light";
  const showFoundations = actor.demo || hasCapability(actor.access, "admin.permissions.manage");
  const allowed: NavigationSection[] = filterNavigation(navigationManifest, actor.access, { showFoundations });
  return <div className="app-shell" data-initial-theme={theme}>
    <script dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=${JSON.stringify(theme)}` }} />
    <WorkspaceNavigation actor={actor} sections={allowed}/><main className="main-canvas"><div className="page-wrap">{children}</div></main>
  </div>;
}
