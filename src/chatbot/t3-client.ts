import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { T3OAuthProvider, t3Config, type T3Config } from "./t3-auth";

const item = z
  .object({
    position: z.number().int().nonnegative(),
    itemId: z.string(),
    sourceThreadId: z.string(),
    type: z.string(),
    status: z.string(),
    text: z.string().nullable(),
    textTruncated: z.boolean(),
    nextTextOffset: z.number().nullable().optional(),
    visibility: z.string(),
    runId: z.string().nullable(),
  })
  .passthrough();
export const t3ThreadRead = z
  .object({
    thread: z
      .object({
        threadId: z.string(),
        projectId: z.string(),
        title: z.string(),
        link: z.string().optional(),
        status: z.string(),
        model: z.string(),
        runtimeMode: z.string(),
        pendingRequestCount: z.number(),
        branch: z.string().nullable(),
        archived: z.boolean(),
      })
      .passthrough(),
    items: z.array(item),
    hasMore: z.boolean(),
    nextPosition: z.number().nullable(),
  })
  .passthrough();
export type T3ThreadRead = z.infer<typeof t3ThreadRead>;
export type T3Attachment = {
  id: string;
  type: "image" | "file";
  name: string;
  mimeType: string;
  sizeBytes: number;
};
export type T3Project = { id: string; repository: string };
export interface T3Connection {
  readonly url: string;
  readonly webUrl?: string;
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
}

export class T3Client implements T3Connection {
  private connection?: Promise<Client>;
  readonly url: string;
  readonly webUrl?: string;
  constructor(private config: T3Config) {
    this.url = config.url;
    this.webUrl = config.webUrl;
  }
  private connect() {
    return (this.connection ??= (async () => {
      const client = new Client({ name: "minisago-discord", version: "1" });
      const transport = new StreamableHTTPClientTransport(new URL(this.url), {
        authProvider: new T3OAuthProvider(this.config),
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.any([
              AbortSignal.timeout(30_000),
              ...(init?.signal ? [init.signal] : []),
            ]),
          }),
      });
      try {
        await client.connect(transport);
        return client;
      } catch (error) {
        await client.close().catch(() => {});
        throw error;
      }
    })());
  }
  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    let client: Client | undefined;
    try {
      client = await this.connect();
      const result = await client.callTool({ name, arguments: args });
      if (result.isError)
        throw new Error(
          `T3 ${name} failed. Check the T3 session and connection permissions.`,
        );
      if (result.structuredContent) return result.structuredContent;
      const text = (
        result.content as Array<{ type: string; text?: string }>
      ).find((part) => part.type === "text")?.text;
      if (!text) throw new Error(`T3 ${name} returned no result.`);
      return JSON.parse(text);
    } catch (error) {
      this.connection = undefined;
      await client?.close().catch(() => {});
      // Mutations are never automatically retried: attachment sends have no retry key.
      throw error;
    }
  }
  async close() {
    const connection = this.connection;
    this.connection = undefined;
    await connection?.then((client) => client.close()).catch(() => {});
  }
}

export async function t3Projects(client: T3Connection): Promise<T3Project[]> {
  const projects: T3Project[] = [];
  let cursor: number | null = 0;
  const pageSchema = z.object({
    projects: z.array(
      z.object({
        id: z.string(),
        archivedAt: z.string().nullable().optional(),
        deletedAt: z.string().nullable().optional(),
        repositoryIdentity: z
          .object({
            owner: z.string().optional(),
            name: z.string().optional(),
            locator: z.object({ remoteUrl: z.string() }),
          })
          .nullable()
          .optional(),
      }),
    ),
    nextCursor: z.number().nullable(),
  });
  while (cursor !== null) {
    const page = pageSchema.parse(
      await client.call("t3_project_list", { cursor, limit: 100 }),
    );
    for (const project of page.projects) {
      if (
        project.archivedAt ||
        project.deletedAt ||
        !project.repositoryIdentity
      )
        continue;
      const identity = project.repositoryIdentity;
      const match = identity.locator.remoteUrl.match(
        /(?:github\.com[:/])([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/iu,
      );
      if (match)
        projects.push({
          id: project.id,
          repository: `${match[1]}/${match[2]}`,
        });
    }
    if (page.nextCursor !== null && page.nextCursor <= cursor)
      throw new Error("T3 returned an invalid project cursor.");
    cursor = page.nextCursor;
  }
  return projects;
}

export function configuredT3Client() {
  const config = t3Config();
  return config ? new T3Client(config) : undefined;
}
