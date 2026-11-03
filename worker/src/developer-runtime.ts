import { join } from "node:path";

export function developerFilesystemPermissions(
  codexHome: string,
  readPaths: string[],
  writePaths: string[] = [],
  platform: NodeJS.Platform = process.platform,
) {
  const runtimeReadPaths = platform === "linux" ? ["/proc"] : [];
  const directReads = [
    ...new Set([...runtimeReadPaths, join(codexHome, "skills"), ...readPaths]),
  ]
    .map((path) => `${JSON.stringify(path)}="read"`)
    .join(",");
  const directWrites = [...new Set(writePaths)]
    .map((path) => `${JSON.stringify(path)}="write"`)
    .join(",");
  const directPermissions = [directReads, directWrites]
    .filter(Boolean)
    .join(",");
  return `{":minimal"="read",${directPermissions},":workspace_roots"={"."="write"}}`;
}
