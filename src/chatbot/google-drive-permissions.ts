import { z } from "zod";

// Google permission IDs identify the groups even if their names change.
export const DRIVE_ROLE_MAPPINGS = [
  {
    name: "部長",
    roleId: "1514899497199861863",
    groupId: "18259735777085188211",
    email: "sa-exec@nthusa.tw",
  },
  {
    name: "活動",
    roleId: "1514899497187147824",
    groupId: "05415442588406427337",
    email: "sa-event@nthusa.tw",
  },
  {
    name: "社群",
    roleId: "1514899497199861861",
    groupId: "01616822651626245728",
    email: "sa-media@nthusa.tw",
  },
  {
    name: "學權",
    roleId: "1514899497187147825",
    groupId: "14941550795780554670",
    email: "sa-rights@nthusa.tw",
  },
  {
    name: "資訊",
    roleId: "1514899497187147822",
    groupId: "04404395933289868804",
    email: "sa-it@nthusa.tw",
  },
] as const;

export type DriveRequester = { roleIds: readonly string[] };
export const ALL_GUILD_MEMBERS = "guild";

const permissionPage = z.object({
  nextPageToken: z.string().min(1).max(4096).optional(),
  permissions: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        role: z.string(),
        deleted: z.boolean().optional(),
        expirationTime: z.string().optional(),
        view: z.string().optional(),
        inheritedPermissionsDisabled: z.boolean().optional(),
        permissionDetails: z
          .array(z.object({ inherited: z.boolean(), role: z.string() }))
          .optional(),
      }),
    )
    .max(100),
});
const readableRoles = new Set([
  "owner",
  "organizer",
  "fileOrganizer",
  "writer",
  "commenter",
  "reader",
]);

export async function driveItemRoleIds(
  fileId: string,
  api: (path: string, params: Record<string, string>) => Promise<Response>,
) {
  const roles = new Set<string>();
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const data = permissionPage.parse(
      await (
        await api(`files/${fileId}/permissions`, {
          supportsAllDrives: "true",
          pageSize: "100",
          fields:
            "nextPageToken,permissions(id,type,role,deleted,expirationTime,view,inheritedPermissionsDisabled,permissionDetails(inherited,role))",
          ...(pageToken ? { pageToken } : {}),
        })
      ).json(),
    );
    for (const permission of data.permissions) {
      if (
        permission.type !== "group" ||
        permission.deleted ||
        permission.view ||
        !readableRoles.has(permission.role)
      )
        continue;
      if (
        permission.expirationTime &&
        !(Date.parse(permission.expirationTime) > Date.now())
      )
        continue;
      if (
        permission.inheritedPermissionsDisabled &&
        permission.role !== "organizer" &&
        permission.role !== "owner" &&
        !permission.permissionDetails?.some(
          (detail) => !detail.inherited && readableRoles.has(detail.role),
        )
      )
        continue;
      const mapping = DRIVE_ROLE_MAPPINGS.find(
        (group) => group.groupId === permission.id,
      );
      roles.add(mapping ? mapping.roleId : ALL_GUILD_MEMBERS);
    }
    if (!data.nextPageToken) return roles;
    if (seenTokens.has(data.nextPageToken)) break;
    seenTokens.add(data.nextPageToken);
    pageToken = data.nextPageToken;
  }
  throw new Error("Drive permission listing could not be completed.");
}

export async function canReadDriveItem(
  fileId: string,
  requester: DriveRequester,
  api: Parameters<typeof driveItemRoleIds>[1],
) {
  const roles = await driveItemRoleIds(fileId, api);
  return (
    roles.has(ALL_GUILD_MEMBERS) ||
    requester.roleIds.some((role) => roles.has(role))
  );
}
