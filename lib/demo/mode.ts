export function isDemoMode(): boolean {
  if(process.env.GITHUB_PAGES_DEMO==="1") return true;
  const value=process.env.DEMO_MODE?.trim().toLowerCase();

  if(["true","1","yes","on"].includes(value??"")) return true;
  if(["false","0","no","off"].includes(value??"")) return false;

  // On Vercel the synthetic demo organization is available as an explicit
  // workspace. It no longer bypasses a valid database session automatically.
  return process.env.VERCEL==="1";
}
