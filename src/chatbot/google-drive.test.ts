import { generateKeyPairSync, verify } from "node:crypto";
import { expect, test } from "bun:test";
import {
  APPROVED_DRIVES,
  DRIVE_GUILD_ID,
  DRIVE_SERVICE_ACCOUNT,
  createGoogleDriveClient,
} from "./google-drive";
import { ChatbotMediaRegistry } from "./media-assets";
import { DRIVE_ROLE_MAPPINGS } from "./google-drive-permissions";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credentials = {
  type: "service_account",
  project_id: "nthusa-discord-drive",
  client_email: DRIVE_SERVICE_ACCOUNT,
  private_key_id: "test-key",
  private_key: keys.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString(),
};
const env = {
  MINISAGO_GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: JSON.stringify(credentials),
  MINISAGO_GOOGLE_DRIVE_ACCESS: "roles",
};
const context = {
  guildId: DRIVE_GUILD_ID,
  resolveRequester: async () => ({ roleIds: [DRIVE_ROLE_MAPPINGS[0].roleId] }),
};
const driveId = Object.keys(APPROVED_DRIVES)[0]!;
const file = {
  id: "file_1",
  driveId,
  name: "Meeting minutes",
  mimeType: "application/vnd.google-apps.document",
  version: "1",
  capabilities: { canDownload: true },
};
function fixture(
  handle: (url: URL, init: RequestInit) => Response | Promise<Response>,
  permissions: (url: URL) => Response | Promise<Response> = () =>
    Response.json({
      permissions: [
        { id: DRIVE_ROLE_MAPPINGS[0].groupId, type: "group", role: "reader" },
      ],
    }),
) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const request = (async (
    url: string | URL | Request,
    init: RequestInit = {},
  ) => {
    const parsed = new URL(String(url));
    calls.push({ url: parsed, init });
    if (parsed.hostname === "oauth2.googleapis.com")
      return Response.json({
        access_token: "never-output-token",
        expires_in: 3600,
      });
    expect(parsed.origin).toBe("https://www.googleapis.com");
    expect(parsed.pathname).toStartWith("/drive/v3/");
    expect(init.method ?? "GET").toBe("GET");
    expect(init.redirect).toBe("error");
    if (parsed.pathname.endsWith("/permissions")) return permissions(parsed);
    return handle(parsed, init);
  }) as typeof fetch;
  const media = new ChatbotMediaRegistry();
  return {
    client: createGoogleDriveClient(env, context, media, request)!,
    media,
    request,
    calls,
  };
}

test("Drive tools require the exact account, guild, and role access mode", () => {
  const media = new ChatbotMediaRegistry();
  for (const guildId of [undefined, "other"])
    expect(
      createGoogleDriveClient(env, { ...context, guildId }, media),
    ).toBeUndefined();
  for (const mode of [undefined, "owner", "guild", "unknown"])
    expect(
      createGoogleDriveClient(
        { ...env, MINISAGO_GOOGLE_DRIVE_ACCESS: mode },
        context,
        media,
      ),
    ).toBeUndefined();
  expect(createGoogleDriveClient(env, context, media)).toBeDefined();
  for (const value of [
    "{}",
    "bad",
    JSON.stringify({ ...credentials, client_email: "admin@nthusa.tw" }),
    JSON.stringify({ ...credentials, project_id: "other" }),
    JSON.stringify({ ...credentials, private_key: "broken" }),
  ])
    expect(
      createGoogleDriveClient(
        { ...env, MINISAGO_GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: value },
        context,
        media,
      ),
    ).toBeUndefined();
});
test("JWT is signed for readonly Drive without admin impersonation; concurrent reads share token", async () => {
  const { client, calls } = fixture(() => Response.json({ files: [] }));
  await Promise.all([
    client.call("search_drive_files", { driveId }),
    client.call("search_drive_files", { driveId }),
  ]);
  const tokens = calls.filter(
    (c) => c.url.hostname === "oauth2.googleapis.com",
  );
  expect(tokens).toHaveLength(1);
  const [h, p, sig] = (tokens[0]!.init.body as URLSearchParams)
    .get("assertion")!
    .split(".");
  const payload = JSON.parse(Buffer.from(p!, "base64url").toString());
  expect(payload).toMatchObject({
    iss: DRIVE_SERVICE_ACCOUNT,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
  });
  expect(payload.sub).toBeUndefined();
  expect(payload.exp - payload.iat).toBe(3600);
  expect(
    verify(
      "RSA-SHA256",
      Buffer.from(`${h}.${p}`),
      keys.publicKey,
      Buffer.from(sig!, "base64url"),
    ),
  ).toBe(true);
});
test("search escapes user text, paginates within one drive, and filters foreign results", async () => {
  const { client } = fixture((url) => {
    expect(url.searchParams.get("corpora")).toBe("drive");
    expect(url.searchParams.get("driveId")).toBe(driveId);
    expect(url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(url.searchParams.get("includeItemsFromAllDrives")).toBe("true");
    expect(url.searchParams.get("q")).toBe(
      "trashed = false and fullText contains 'meeting\\'s \\\\ notes'",
    );
    expect(url.searchParams.get("pageToken")).toBe("page2");
    return Response.json({
      files: [
        file,
        { ...file, id: "file_2", driveId: "foreign" },
        { ...file, id: "file_3", trashed: true },
      ],
      nextPageToken: "page3",
      incompleteSearch: true,
    });
  });
  const result = await client.call("search_drive_files", {
    driveId,
    query: "meeting's \\ notes",
    pageToken: "page2",
  });
  expect(result).toMatchObject({
    status: "complete",
    nextPageToken: "page3",
    incompleteSearch: true,
    files: [{ id: "file_1" }],
  });
  expect(result.files).toHaveLength(1);
});
test("search and folder reads expose actual ancestry across different drive layouts", async () => {
  const otherDriveId = Object.keys(APPROVED_DRIVES)[1]!;
  const folders = [
    { ...file, id: "folder_35", name: "35", parents: [driveId] },
    {
      ...file,
      id: "folder_minutes",
      name: "會議紀錄",
      driveId: otherDriveId,
      parents: [otherDriveId],
    },
  ].map((folder) => ({
    ...folder,
    mimeType: "application/vnd.google-apps.folder",
    capabilities: { canDownload: false },
  }));
  const { client, calls } = fixture((url) => {
    expect(url.searchParams.get("fields")).toContain("parents");
    if (url.pathname === "/drive/v3/files") {
      const selected = folders.find(
        (folder) => folder.driveId === url.searchParams.get("driveId"),
      )!;
      expect(url.searchParams.get("q")).toBe("trashed = false");
      return Response.json({
        files: [{ ...file, driveId: selected.driveId, parents: [selected.id] }],
      });
    }
    const folder = folders.find((f) => url.pathname.endsWith(`/${f.id}`));
    expect(folder).toBeDefined();
    return Response.json(folder);
  });
  for (const folder of folders) {
    const result = await client.call("search_drive_files", {
      driveId: folder.driveId,
    });
    expect(result).toMatchObject({
      status: "complete",
      files: [{ parentIds: [folder.id] }],
    });
    expect(
      await client.call("read_drive_file", { fileId: folder.id }),
    ).toMatchObject({
      status: "folder",
      file: { name: folder.name, parentIds: [folder.driveId] },
    });
  }
  expect(
    calls.filter((call) => !call.url.pathname.endsWith("/permissions")),
  ).toHaveLength(5);
});
test("invalid inputs cannot select foreign drives, raw queries, URLs or API endpoints", async () => {
  const { client, calls } = fixture(() => {
    throw new Error("unexpected");
  });
  for (const input of [
    { driveId: "foreign" },
    { driveId, q: "trashed = true" },
    { driveId, limit: 500 },
  ])
    expect((await client.call("search_drive_files", input)).status).toBe(
      "unavailable",
    );
  for (const input of [
    { fileId: "../secrets" },
    { fileId: "https://evil.test" },
    { fileId: "file_1", url: "https://evil.test" },
  ])
    expect((await client.call("read_drive_file", input)).status).toBe(
      "unavailable",
    );
  expect(calls).toHaveLength(0);
});
test("every read rechecks metadata and refuses foreign, trashed and download-restricted files", async () => {
  for (const change of [
    { driveId: "foreign" },
    { trashed: true },
    { capabilities: { canDownload: false } },
  ]) {
    const { client, calls } = fixture(() =>
      Response.json({ ...file, ...change }),
    );
    expect(
      (await client.call("read_drive_file", { fileId: file.id })).status,
    ).toBe("unavailable");
    expect(
      calls.filter((call) => !call.url.pathname.endsWith("/permissions")),
    ).toHaveLength(2);
  }
  let reads = 0;
  const { client } = fixture((url) => {
    if (url.pathname.endsWith("/export")) return new Response("Hello meeting");
    return Response.json({
      ...file,
      driveId: reads++ === 0 ? driveId : "foreign",
    });
  });
  expect(
    (await client.call("read_drive_file", { fileId: file.id })).status,
  ).toBe("complete");
  expect(
    (await client.call("read_drive_file", { fileId: file.id })).status,
  ).toBe("unavailable");
});
test("Google Docs export returns bounded text, continuation, and a source link", async () => {
  const { client } = fixture((url) => {
    if (url.pathname.endsWith("/export")) {
      expect(url.searchParams.get("mimeType")).toBe("text/plain");
      return new Response("會議紀錄：hello world");
    }
    return Response.json(file);
  });
  expect(
    await client.call("read_drive_file", { fileId: file.id, limit: 5 }),
  ).toMatchObject({
    status: "complete",
    text: "會議紀錄：",
    nextOffset: 5,
    untrustedContent: true,
    file: { webViewLink: "https://drive.google.com/file/d/file_1/view" },
  });
  expect(
    await client.call("read_drive_file", { fileId: file.id, offset: 5 }),
  ).toMatchObject({ text: "hello world", nextOffset: undefined });
});
test("shortcuts do not bypass drive restrictions and parent filters are checked", async () => {
  const { client, calls } = fixture(() =>
    Response.json({
      ...file,
      mimeType: "application/vnd.google-apps.shortcut",
      shortcutDetails: { targetId: "foreign_file" },
    }),
  );
  expect(
    await client.call("read_drive_file", { fileId: file.id }),
  ).toMatchObject({ status: "shortcut", targetId: "foreign_file" });
  expect(
    calls.filter((call) => !call.url.pathname.endsWith("/permissions")),
  ).toHaveLength(2);
  expect(
    (await client.call("search_drive_files", { driveId, parentId: file.id }))
      .status,
  ).toBe("unavailable");
  expect(
    calls.filter((call) => !call.url.pathname.endsWith("/permissions")),
  ).toHaveLength(3);
});
test("PDFs become request-local media, cached only after fresh authorization, without credentials", async () => {
  let metadataCalls = 0;
  const bytes = new TextEncoder().encode("%PDF-1.7 test");
  const { client, media, calls } = fixture((url) => {
    if (url.searchParams.get("alt") === "media") return new Response(bytes);
    metadataCalls++;
    return Response.json({
      ...file,
      name: "../minutes.pdf",
      mimeType: "application/pdf",
    });
  });
  const result = await client.call("read_drive_file", { fileId: file.id });
  expect(result.status).toBe("complete");
  const asset = result.media as { mediaId: string; filename: string };
  expect(asset.filename).not.toContain("/");
  expect((await media.read(asset.mediaId)).bytes).toEqual(bytes);
  expect(JSON.stringify(result)).not.toContain("never-output-token");
  expect(JSON.stringify(result)).not.toContain("PRIVATE KEY");
  expect(
    (await client.call("read_drive_file", { fileId: file.id })).media,
  ).toEqual(asset);
  expect(metadataCalls).toBe(3);
  expect(
    calls.filter((c) => c.url.searchParams.get("alt") === "media"),
  ).toHaveLength(1);
});
test("rejects oversized streams, supports Sheets export, and sanitizes Google errors", async () => {
  const { client } = fixture((url) => {
    if (url.pathname.endsWith("/export")) {
      expect(url.searchParams.get("mimeType")).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      return new Response(new Uint8Array(8 * 1024 * 1024 + 1));
    }
    return Response.json({
      ...file,
      mimeType: "application/vnd.google-apps.spreadsheet",
    });
  });
  expect(
    (await client.call("read_drive_file", { fileId: file.id })).error,
  ).toContain("8 MiB");
  const bad = fixture(
    () => new Response("secret-never-output", { status: 403 }),
  );
  const response = await bad.client.call("read_drive_file", {
    fileId: file.id,
  });
  expect(response.status).toBe("unavailable");
  expect(JSON.stringify(response)).not.toContain("secret-never-output");
});

test("text pagination reuses bytes after checking current permissions and version", async () => {
  let exports = 0;
  const { client } = fixture((url) => {
    if (url.pathname.endsWith("/export")) {
      exports++;
      return new Response("x".repeat(100000));
    }
    return Response.json(file);
  });
  for (let offset = 0; offset < 100000; offset += 16000)
    expect(
      (
        await client.call("read_drive_file", {
          fileId: file.id,
          offset,
          limit: 16000,
        })
      ).status,
    ).toBe("complete");
  expect(exports).toBe(1);
});

test("aggregate read budget bounds multiple document downloads", async () => {
  let downloads = 0;
  const { client } = fixture((url) => {
    if (url.searchParams.get("alt") === "media") {
      downloads++;
      return new Response(new Uint8Array(8 * 1024 * 1024));
    }
    return Response.json({
      ...file,
      id: url.pathname.split("/").at(-1),
      mimeType: "application/pdf",
    });
  });
  for (const fileId of ["file_1", "file_2", "file_3"])
    expect((await client.call("read_drive_file", { fileId })).status).toBe(
      "complete",
    );
  expect(
    (await client.call("read_drive_file", { fileId: "file_4" })).error,
  ).toContain("24 MiB");
  expect(downloads).toBe(3);
});

test("catalog and search filter permissions without leaking denied names or losing pagination", async () => {
  const { client } = fixture(
    () =>
      Response.json({
        files: [file, { ...file, id: "denied_file", name: "private-name" }],
        nextPageToken: "continue",
      }),
    (url) =>
      Response.json({
        permissions: url.pathname.includes("denied_file")
          ? []
          : [
              {
                id: DRIVE_ROLE_MAPPINGS[0].groupId,
                type: "group",
                role: "reader",
              },
            ],
      }),
  );
  const result = await client.call("search_drive_files", { driveId });
  expect(result).toMatchObject({
    status: "complete",
    files: [{ id: file.id }],
    nextPageToken: "continue",
  });
  expect(result.files).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain("private-name");
  const blocked = fixture(
    () => {
      throw new Error("Content must not be requested");
    },
    () => Response.json({ permissions: [] }),
  );
  expect(await blocked.client.call("list_shared_drives", {})).toMatchObject({
    status: "complete",
    drives: [],
  });
  expect(
    (await blocked.client.call("search_drive_files", { driveId })).status,
  ).toBe("unavailable");
});

test("direct IDs, cached text and cached media recheck requester roles and Google permissions", async () => {
  let roleIds: string[] = [DRIVE_ROLE_MAPPINGS[0].roleId];
  let allowed = true;
  let binary = false;
  const setup = fixture(
    (url) => {
      if (url.pathname.endsWith("/export")) return new Response("meeting text");
      if (url.searchParams.get("alt") === "media")
        return new Response("%PDF-test");
      return Response.json({
        ...file,
        mimeType: binary ? "application/pdf" : file.mimeType,
      });
    },
    () =>
      Response.json({
        permissions: allowed
          ? [
              {
                id: DRIVE_ROLE_MAPPINGS[0].groupId,
                type: "group",
                role: "reader",
              },
            ]
          : [],
      }),
  );
  const client = createGoogleDriveClient(
    env,
    { guildId: DRIVE_GUILD_ID, resolveRequester: async () => ({ roleIds }) },
    setup.media,
    setup.request,
  )!;
  expect(
    (await client.call("read_drive_file", { fileId: file.id })).status,
  ).toBe("complete");
  roleIds = [];
  expect(
    (await client.call("read_drive_file", { fileId: file.id })).status,
  ).toBe("unavailable");
  roleIds = [DRIVE_ROLE_MAPPINGS[0].roleId];
  binary = true;
  const result = await client.call("read_drive_file", { fileId: file.id });
  const mediaId = (result.media as { mediaId: string }).mediaId;
  expect((await setup.media.read(mediaId)).bytes.length).toBeGreaterThan(0);
  allowed = false;
  expect(
    (await client.call("read_drive_file", { fileId: file.id })).status,
  ).toBe("unavailable");
  await expect(setup.media.read(mediaId)).rejects.toThrow(
    "no longer available",
  );
  allowed = true;
  roleIds = [];
  await expect(setup.media.read(mediaId)).rejects.toThrow(
    "no longer available",
  );
});

test("permission API failure returns no file content and tool arguments cannot claim roles", async () => {
  const { client, calls } = fixture(
    () => Response.json(file),
    () => new Response("private error", { status: 403 }),
  );
  expect(
    (await client.call("read_drive_file", { fileId: file.id })).status,
  ).toBe("unavailable");
  expect(calls.some((c) => c.url.pathname.endsWith("/export"))).toBe(false);
  const before = calls.length;
  expect(
    (
      await client.call("read_drive_file", {
        fileId: file.id,
        roleIds: [DRIVE_ROLE_MAPPINGS[0].roleId],
      })
    ).status,
  ).toBe("unavailable");
  expect(calls).toHaveLength(before);
});
