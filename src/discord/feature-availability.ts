import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  featureDefinition,
  REGISTERED_FEATURE_IDS,
  type RegisteredFeatureId,
} from "./features";

// Preserve the public descriptions shape for existing callers.
export const SCOPED_FEATURE_DEFINITIONS = Object.fromEntries(
  REGISTERED_FEATURE_IDS.map((id) => [id, featureDefinition(id).description]),
) as Record<RegisteredFeatureId, string>;
export type ScopedFeatureId = RegisteredFeatureId;
export type FeatureScope = "guild" | "channel";
export type FeatureContext = {
  guildId?: string;
  channelId?: string;
  roleIds?: readonly string[];
};
export type FeatureRoleFilters = {
  allowRoleIds?: string[];
  denyRoleIds?: string[];
};
export type FeatureRule = FeatureRoleFilters & {
  scope: FeatureScope;
  targetId: string;
  enabled: boolean;
};
export type FeaturePolicy = {
  defaultEnabled: boolean;
  rules: FeatureRule[];
};
export type FeatureAvailabilitySnapshot = {
  version: 1;
  features: Record<ScopedFeatureId, FeaturePolicy>;
};
export type FeatureAvailabilityMutation = FeatureRoleFilters & {
  feature: ScopedFeatureId;
  scope: FeatureScope;
  targetId: string;
  action: "enable" | "disable" | "inherit";
};

const DISCORD_SNOWFLAKE = /^\d{17,20}$/u;

export function defaultFeatureAvailability(
  environment: NodeJS.ProcessEnv = process.env,
): FeatureAvailabilitySnapshot {
  return {
    version: 1,
    features: Object.fromEntries(
      REGISTERED_FEATURE_IDS.map((id) => [
        id,
        featureDefinition(id).registration!.initialPolicy(environment),
      ]),
    ) as Record<ScopedFeatureId, FeaturePolicy>,
  };
}

function validRoleIds(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= 250 &&
      value.every((id) => typeof id === "string" && DISCORD_SNOWFLAKE.test(id)))
  );
}

function rolesAllowed(rule: FeatureRule, context: FeatureContext) {
  // Unknown membership cannot safely satisfy a denylist either.
  const filtered = Boolean(
    rule.allowRoleIds?.length || rule.denyRoleIds?.length,
  );
  if (filtered && (!context.guildId || context.roleIds === undefined))
    return false;
  const roles = new Set([context.guildId, ...(context.roleIds ?? [])]);
  if (rule.denyRoleIds?.some((id) => roles.has(id))) return false;
  return (
    !rule.allowRoleIds?.length || rule.allowRoleIds.some((id) => roles.has(id))
  );
}

function assertSnapshot(
  value: unknown,
  environment: NodeJS.ProcessEnv,
): FeatureAvailabilitySnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("Feature availability must be a JSON object.");
  }
  const snapshot = value as Partial<FeatureAvailabilitySnapshot>;
  if (snapshot.version !== 1 || !snapshot.features) {
    throw new Error("Unsupported feature availability format.");
  }
  for (const feature of REGISTERED_FEATURE_IDS) {
    const registration = featureDefinition(feature).registration!;
    if (
      snapshot.features[feature] === undefined &&
      !registration.legacyRequired
    ) {
      snapshot.features[feature] = registration.initialPolicy(environment);
    }
    const policy = snapshot.features[feature];
    if (!policy || typeof policy.defaultEnabled !== "boolean") {
      throw new Error(`Feature availability is missing ${feature}.`);
    }
    if (
      !Array.isArray(policy.rules) ||
      policy.rules.some(
        (rule) =>
          !["guild", "channel"].includes(rule.scope) ||
          !DISCORD_SNOWFLAKE.test(rule.targetId) ||
          typeof rule.enabled !== "boolean" ||
          !validRoleIds(rule.allowRoleIds) ||
          !validRoleIds(rule.denyRoleIds),
      )
    ) {
      throw new Error(`Feature availability has invalid ${feature} rules.`);
    }
    if (!registration.allowDefaultEnabled && policy.defaultEnabled) {
      throw new Error(
        `${feature} requires explicit ${registration.scopes.length === 1 ? registration.scopes[0] + " " : ""}registrations with a disabled default.`,
      );
    }
    if (
      policy.rules.some((rule) => !registration.scopes.includes(rule.scope))
    ) {
      throw new Error(
        `${feature} requires explicit ${registration.scopes.join(" or ")} registrations.`,
      );
    }
  }
  return snapshot as FeatureAvailabilitySnapshot;
}

function copySnapshot(
  snapshot: FeatureAvailabilitySnapshot,
): FeatureAvailabilitySnapshot {
  return structuredClone(snapshot);
}

export class FeatureAvailabilityStore {
  private snapshot: FeatureAvailabilitySnapshot;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    environment: NodeJS.ProcessEnv = process.env,
  ) {
    this.snapshot = existsSync(filePath)
      ? assertSnapshot(JSON.parse(readFileSync(filePath, "utf8")), environment)
      : defaultFeatureAvailability(environment);
  }

  list() {
    return copySnapshot(this.snapshot);
  }

  isEnabled(feature: ScopedFeatureId, context: FeatureContext) {
    const registration = featureDefinition(feature).registration!;
    if (!context.guildId && registration.dm === "none") return false;
    const policy = this.snapshot.features[feature];
    const channelRule = context.channelId
      ? policy.rules.find(
          (rule) =>
            rule.scope === "channel" && rule.targetId === context.channelId,
        )
      : undefined;
    if (channelRule)
      return channelRule.enabled && rolesAllowed(channelRule, context);

    const guildRule = context.guildId
      ? policy.rules.find(
          (rule) => rule.scope === "guild" && rule.targetId === context.guildId,
        )
      : undefined;
    return guildRule
      ? guildRule.enabled && rolesAllowed(guildRule, context)
      : policy.defaultEnabled;
  }

  configure(input: FeatureAvailabilityMutation): Promise<FeaturePolicy> {
    const registration = featureDefinition(input.feature).registration;
    if (!registration || !registration.scopes.includes(input.scope)) {
      return Promise.reject(
        new Error(
          `${input.feature} registration requires ${registration?.scopes.join(" or ") ?? "supported"} scope.`,
        ),
      );
    }
    if (!validRoleIds(input.allowRoleIds) || !validRoleIds(input.denyRoleIds)) {
      return Promise.reject(
        new Error(
          "Role filters must contain valid Discord role IDs (at most 250 each).",
        ),
      );
    }
    if (
      input.action !== "enable" &&
      (input.allowRoleIds?.length || input.denyRoleIds?.length)
    ) {
      return Promise.reject(
        new Error("Role filters apply only to enabled registrations."),
      );
    }
    if (!DISCORD_SNOWFLAKE.test(input.targetId)) {
      return Promise.reject(new Error("targetId must be a Discord ID."));
    }

    const mutation = this.mutationQueue.then(async () => {
      const next = copySnapshot(this.snapshot);
      const policy = next.features[input.feature];
      policy.rules = policy.rules.filter(
        (rule) =>
          rule.scope !== input.scope || rule.targetId !== input.targetId,
      );
      if (input.action !== "inherit") {
        policy.rules.push({
          scope: input.scope,
          targetId: input.targetId,
          enabled: input.action === "enable",
          ...(input.allowRoleIds?.length
            ? { allowRoleIds: [...new Set(input.allowRoleIds)].sort() }
            : {}),
          ...(input.denyRoleIds?.length
            ? { denyRoleIds: [...new Set(input.denyRoleIds)].sort() }
            : {}),
        });
      }
      policy.rules.sort((left, right) =>
        `${left.scope}:${left.targetId}`.localeCompare(
          `${right.scope}:${right.targetId}`,
        ),
      );
      await this.persist(next);
      this.snapshot = next;
      return structuredClone(policy);
    });
    this.mutationQueue = mutation.catch(() => undefined);
    return mutation;
  }

  private async persist(snapshot: FeatureAvailabilitySnapshot) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }
}

let sharedStore: FeatureAvailabilityStore | undefined;

export function featureAvailabilityFile(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return (
    environment.MINISAGO_FEATURE_AVAILABILITY_FILE?.trim() ||
    (environment.NODE_ENV === "production"
      ? "/app/state/feature-availability.json"
      : ".data/feature-availability.json")
  );
}

export function getFeatureAvailabilityStore() {
  sharedStore ??= new FeatureAvailabilityStore(featureAvailabilityFile());
  return sharedStore;
}
