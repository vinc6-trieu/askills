import os from "node:os";
import path from "node:path";

export function askillsHome(): string {
  return process.env.ASKILLS_HOME ??
    path.join(os.homedir(), ".askills");
}

export function registryRoot(): string {
  return process.env.ASKILLS_REGISTRY_PATH ??
    path.join(askillsHome(), "registry");
}

export function registriesRoot(): string {
  return path.join(askillsHome(), "registries");
}

export function registrySourceRoot(name: string): string {
  return path.join(registriesRoot(), name);
}

export function registryCacheRoot(
  name: string,
  commit: string
): string {
  return path.join(
    askillsHome(),
    "cache",
    name,
    commit
  );
}

export function registryConfigPath(): string {
  return path.join(askillsHome(), "config.yaml");
}

export function profilesRoot(): string {
  return path.join(registryRoot(), "profiles");
}

export function skillsRoot(): string {
  return path.join(registryRoot(), "skills");
}

export function registryIndexPath(): string {
  return path.join(
    registryRoot(),
    "registry",
    "skills.yaml"
  );
}
