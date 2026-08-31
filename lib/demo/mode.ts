export function isDemoMode(): boolean {
  const value = process.env.DEMO_MODE?.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(value ?? "")) return true;
  if (["false", "0", "no", "off"].includes(value ?? "")) return false;

  // This repository is currently deployed to Vercel as a visual/demo preview.
  // Default to demo mode there unless it is explicitly disabled above.
  return process.env.VERCEL === "1";
}
