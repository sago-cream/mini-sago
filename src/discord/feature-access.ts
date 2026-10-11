import {
  getFeatureAvailabilityStore,
  type FeatureContext,
  type FeatureAvailabilityStore,
} from "./feature-availability";
import {
  featureDefinition,
  type FeatureId,
  type RegisteredFeatureId,
} from "./features";

// This context is bound by the host, never supplied through MCP tool arguments.
export type FeatureAccessContext = FeatureContext & {
  requesterId?: string;
  ownerId?: string;
  streamReply?: boolean;
  resolveRoleIds?: () => Promise<readonly string[]>;
};
export type FeatureAccess = ReturnType<typeof createFeatureAccess>;
export function createFeatureAccess(
  feature: FeatureId,
  context: FeatureAccessContext,
  availability: Pick<
    FeatureAvailabilityStore,
    "isEnabled"
  > = getFeatureAvailabilityStore(),
) {
  const definition = featureDefinition(feature);
  const registered =
    definition.registrationFeature ??
    (definition.access === "registered" ? feature : undefined);
  const registration = registered
    ? featureDefinition(registered as RegisteredFeatureId).registration!
    : undefined;
  const isOwner = () =>
    Boolean(context.ownerId && context.requesterId === context.ownerId);
  const available = (roleIds = context.roleIds) => {
    if (definition.access === "owner" && !isOwner()) return false;
    if (registration) {
      if (context.streamReply && !registration.voice) return false;
      if (registration.ownerBypass && isOwner()) return true;
      if (!context.guildId) {
        if (registration.dm === "none") return false;
        if (registration.dm === "owner") return isOwner();
      }
      return availability.isEnabled(registered as RegisteredFeatureId, {
        ...context,
        roleIds,
      });
    }
    return true;
  };
  const allowed = async () => {
    if (!registration) return available();
    if (definition.access === "owner" && !isOwner()) return false;
    if (context.streamReply && !registration.voice) return false;
    try {
      const roleIds =
        context.guildId && context.resolveRoleIds
          ? await context.resolveRoleIds()
          : context.roleIds;
      return available(roleIds);
    } catch {
      return false;
    }
  };
  return { available, allowed };
}

// Recheck after reads so a revoked registration cannot release in-flight data.
// Mutation callers use the same guard before execution, then their own confirmation.
export async function withFeatureAccess(
  access: FeatureAccess,
  operation: () => Promise<Record<string, unknown>>,
  recheckResult = true,
): Promise<Record<string, unknown>> {
  if (!(await access.allowed())) return { status: "forbidden" };
  const result = await operation();
  return !recheckResult || (await access.allowed())
    ? result
    : { status: "forbidden" };
}

export function guardFeatureClient<
  TName extends string,
  TExtras extends object,
>(
  access: FeatureAccess,
  client: TExtras & {
    call(name: TName, raw: unknown): Promise<Record<string, unknown>>;
  },
  recheckResult: (name: TName) => boolean = () => true,
) {
  return {
    ...client,
    call: (name: TName, raw: unknown) =>
      withFeatureAccess(
        access,
        () => client.call(name, raw),
        recheckResult(name),
      ),
  };
}
