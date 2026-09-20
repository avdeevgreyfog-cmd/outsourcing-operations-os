export function isGithubPagesDemo(): boolean {
  return process.env.GITHUB_PAGES_DEMO === "1";
}

export function githubPagesBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}
