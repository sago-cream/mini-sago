import { expect, test } from "bun:test";
import {
  ALL_GUILD_MEMBERS,
  DRIVE_ROLE_MAPPINGS,
  canReadDriveItem,
  driveItemRoleIds,
} from "./google-drive-permissions";

const mapped = DRIVE_ROLE_MAPPINGS[0];
const permission = { id: mapped.groupId, type: "group", role: "reader" };
const page = (permissions: unknown[]) => async () =>
  Response.json({ permissions });

test("each mapped Google group authorizes its Discord role, without an owner bypass", async () => {
  for (const mapping of DRIVE_ROLE_MAPPINGS) {
    const api = page([{ ...permission, id: mapping.groupId }]);
    expect(
      await canReadDriveItem("file_1", { roleIds: [mapping.roleId] }, api),
    ).toBe(true);
    expect(
      await canReadDriveItem("file_1", { roleIds: ["unrelated-role"] }, api),
    ).toBe(false);
    expect(await canReadDriveItem("file_1", { roleIds: [] }, api)).toBe(false);
  }
});

test("unmapped active groups grant guild access, but user, domain, and anyone grants do not", async () => {
  expect(
    await canReadDriveItem(
      "file_1",
      { roleIds: [] },
      page([{ ...permission, id: "unmapped-group" }]),
    ),
  ).toBe(true);
  for (const type of ["user", "domain", "anyone"]) {
    expect(
      await canReadDriveItem(
        "file_1",
        { roleIds: [] },
        page([{ ...permission, id: "unmapped", type }]),
      ),
    ).toBe(false);
  }
});

test("metadata-only, deleted, expired, invalid-expiry and non-reader permissions grant no access", async () => {
  for (const change of [
    { view: "metadata" },
    { view: "published" },
    { deleted: true },
    { expirationTime: "2020-01-01T00:00:00Z" },
    { expirationTime: "invalid" },
    { role: "unknown" },
    {
      inheritedPermissionsDisabled: true,
      permissionDetails: [{ inherited: true, role: "reader" }],
    },
  ]) {
    for (const id of [mapped.groupId, "unmapped-group"]) {
      const allowed = await driveItemRoleIds(
        "file_1",
        page([{ ...permission, id, ...change }]),
      );
      expect(allowed.size).toBe(0);
    }
  }
  expect(
    await driveItemRoleIds(
      "file_1",
      page([
        {
          ...permission,
          id: "unmapped-group",
          inheritedPermissionsDisabled: true,
          permissionDetails: [{ inherited: false, role: "reader" }],
        },
      ]),
    ),
  ).toEqual(new Set([ALL_GUILD_MEMBERS]));
  expect(
    await driveItemRoleIds(
      "file_1",
      page([
        {
          ...permission,
          inheritedPermissionsDisabled: true,
          role: "organizer",
        },
      ]),
    ),
  ).toEqual(new Set([mapped.roleId]));
});

test("permission pagination preserves mapped roles and fails closed on malformed or looping pages", async () => {
  const tokens: (string | undefined)[] = [];
  const roles = await driveItemRoleIds("file_1", async (path, params) => {
    expect(path).toBe("files/file_1/permissions");
    expect(params.supportsAllDrives).toBe("true");
    expect(params.useDomainAdminAccess).toBeUndefined();
    tokens.push(params.pageToken);
    return Response.json(
      params.pageToken
        ? { permissions: [permission] }
        : { permissions: [], nextPageToken: "next" },
    );
  });
  expect(tokens).toEqual([undefined, "next"]);
  expect(roles).toEqual(new Set([mapped.roleId]));
  await expect(
    driveItemRoleIds("file_1", async () =>
      Response.json({ permissions: [permission], nextPageToken: "loop" }),
    ),
  ).rejects.toThrow();
  await expect(
    driveItemRoleIds("file_1", async () =>
      Response.json({ permissions: [{ id: "unmapped-group" }] }),
    ),
  ).rejects.toThrow();
});
