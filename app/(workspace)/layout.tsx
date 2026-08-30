import { requireActor } from "@/lib/auth/server";
import { AppShell } from "@/components/AppShell";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  return <AppShell actor={actor}>{children}</AppShell>;
}
