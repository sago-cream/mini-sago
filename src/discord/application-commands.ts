import type { DiscordRequest } from "./api/request";

// Shared by the install script and the owner-bound MCP repair tool.
export const ASK_COMMAND = {
  name: "ask",
  type: 1,
  description: "Ask MiniSago privately in this channel",
  options: [
    {
      name: "prompt",
      type: 3,
      description: "What you want to ask MiniSago",
      required: true,
      max_length: 2_000,
    },
  ],
};

type Command = {
  id: string;
  name: string;
  type: number;
  description: string;
  options?: unknown[];
  default_member_permissions?: string | null;
  default_permission?: boolean;
  contexts?: number[];
  integration_types?: number[];
};
type CommandPermissions = {
  id: string;
  permissions: Array<{ id: string; type: number; permission: boolean }>;
};
export type DiscordCommandsInput = { guildId?: string };

function commandSummary(command: Command) {
  return {
    id: command.id,
    name: command.name,
    type: command.type,
    description: command.description,
    options: command.options,
    defaultMemberPermissions: command.default_member_permissions ?? null,
    defaultPermission: command.default_permission,
    contexts: command.contexts,
    integrationTypes: command.integration_types,
  };
}

async function readSection<T>(read: () => Promise<T>) {
  try {
    return { status: "complete" as const, value: await read() };
  } catch (error) {
    // Discord errors may contain request data; expose only their HTTP status.
    const httpStatus =
      error instanceof Error
        ? error.message.match(/^(\d{3})\b/u)?.[1]
        : undefined;
    return {
      status: "unavailable" as const,
      ...(httpStatus ? { httpStatus: Number(httpStatus) } : {}),
    };
  }
}

export function createDiscordCommandManagement({
  discordRequest,
  applicationId,
  currentGuildId,
}: {
  discordRequest: DiscordRequest;
  applicationId?: string;
  currentGuildId?: string;
}) {
  async function target(input: DiscordCommandsInput) {
    const guildId = input.guildId ?? currentGuildId;
    if (!guildId || !/^\d{17,20}$/u.test(guildId))
      throw new Error(
        "Provide an exact Discord guild ID, or use a guild conversation.",
      );
    if (!applicationId || !/^\d{17,20}$/u.test(applicationId))
      throw new Error("DISCORD_APPLICATION_ID is not configured correctly.");
    const application = await discordRequest<{
      id: string;
      install_params?: { scopes: string[]; permissions: string };
      interactions_endpoint_url?: string | null;
    }>("/applications/@me");
    if (application.id !== applicationId)
      throw new Error(
        "Configured application ID does not match the bot application.",
      );
    const guild = await discordRequest<{ id: string; name: string }>(
      `/guilds/${guildId}`,
    );
    return {
      guild: { id: guild.id, name: guild.name },
      application,
      path: `/applications/${applicationId}/guilds/${guildId}/commands`,
    };
  }

  return {
    async inspect(input: DiscordCommandsInput) {
      const { guild, application, path } = await target(input);
      const [globalCommands, guildCommands, permissions] = await Promise.all([
        readSection(async () =>
          (
            await discordRequest<Command[]>(
              `/applications/${applicationId}/commands`,
            )
          ).map(commandSummary),
        ),
        readSection(async () =>
          (await discordRequest<Command[]>(path)).map(commandSummary),
        ),
        readSection(async () =>
          (
            await discordRequest<CommandPermissions[]>(`${path}/permissions`)
          ).map(({ id, permissions }) => ({ id, permissions })),
        ),
      ]);
      return {
        status: [globalCommands, guildCommands, permissions].every(
          (section) => section.status === "complete",
        )
          ? "complete"
          : "partial",
        applicationId,
        guild,
        installDefaults: application.install_params,
        interactionDelivery: application.interactions_endpoint_url
          ? "http_endpoint"
          : "gateway",
        globalCommands,
        guildCommands,
        permissions,
        guidance:
          "Registration and command overrides do not prove a particular member can see or use /ask. Check their channel View Channel and Use Application Commands permissions, Server Settings > Integrations, installation authorization and MiniSago chatbot feature policy separately. Unavailable sections are unknown, not empty. Install defaults do not prove an existing guild grant. HTTP interaction delivery prevents MiniSago's Gateway handler from receiving commands.",
      };
    },
    async sync(input: DiscordCommandsInput) {
      const { guild, path } = await target(input);
      const commands = await discordRequest<Command[]>(path);
      const existing = commands.find(
        (command) => command.name === "ask" && command.type === 1,
      );
      // Patch only the known definition: keep existing permission defaults and
      // command ID/overrides. Never bulk-overwrite other commands or scopes.
      const { type: _type, ...patch } = ASK_COMMAND;
      const command = await discordRequest<Command>(
        existing ? `${path}/${existing.id}` : path,
        {
          method: existing ? "PATCH" : "POST",
          body: existing ? patch : ASK_COMMAND,
        },
      );
      const verification = await readSection(async () => {
        const registered = await discordRequest<Command[]>(path);
        const found = registered.find(
          (value) =>
            value.id === command.id && value.name === "ask" && value.type === 1,
        );
        if (!found)
          throw new Error("Command was not found after registration.");
        return commandSummary(found);
      });
      return {
        status:
          verification.status === "complete" ? "synced" : "updated_unverified",
        applicationId,
        guild,
        command: commandSummary(command),
        verification,
        guidance:
          "Discord accepted the guild /ask definition. This does not confirm client command-picker visibility or member access. Inspect registration and permissions separately; MiniSago feature policies still apply.",
      };
    },
  };
}
