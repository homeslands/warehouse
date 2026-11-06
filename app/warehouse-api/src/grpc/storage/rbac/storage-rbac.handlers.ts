import { UntypedServiceImplementation } from '@grpc/grpc-js';
import { DataSource } from 'typeorm';
import { w02EnumAdapter } from 'src/grpc/enum/w02-storage-enums';
import { AuthorityV1Service } from 'src/rbac-v1/authority-v1.service';
import {
  AUTHORITY_PATCH_RULES,
  parseAuthorityCode,
  parseListQuery,
  parsePatch,
  parseUuid,
  parseVersion,
  ROLE_PATCH_RULES,
} from 'src/rbac-v1/rbac-v1.request';
import { Page, RoleActionOutcome, RoleV1Service, RoleView } from 'src/rbac-v1/role-v1.service';
import { assertAuthorized, resolveActor, V1Actor } from 'src/rbac-v1/v1-authorizer';
import { SessionPrincipal } from 'src/session/session.service';
import {
  authenticated,
  RawRequest,
  RpcRun,
  StorageAuthHandlerDependencies,
  unaryHandler,
} from '../auth/storage-auth.handlers';
import { StorageCallContext } from '../storage-grpc.server';

export interface StorageRbacHandlerDependencies extends StorageAuthHandlerDependencies {
  dataSource: DataSource;
  roles: RoleV1Service;
  authorities: AuthorityV1Service;
}

/** `x-authority` của từng RPC (OpenAPI R2). Mảng = OR trên mã quyền (không có `|` ở các op này). */
export const RBAC_RPC_AUTHORITY: Readonly<Record<string, readonly string[]>> = {
  ListRoles: ['ROLE_READ'],
  GetRole: ['ROLE_READ'],
  UpdateRole: ['ROLE_UPDATE'],
  DeleteRole: ['ROLE_DELETE'],
  ListAuthorities: ['MANAGE_PERMISSIONS'],
  ListAuthorityGroups: ['MANAGE_PERMISSIONS'],
  UpdateAuthorityMetadata: ['MANAGE_PERMISSIONS'],
  PutRoleAuthority: ['MANAGE_PERMISSIONS'],
  DeleteRoleAuthority: ['MANAGE_PERMISSIONS'],
};

function page<T>(result: Page<T>, map: (item: T) => object): object {
  const totalPages = Math.ceil(result.total / result.pageSize);
  return {
    page: String(result.page),
    pageSize: String(result.pageSize),
    total: String(result.total),
    totalPages: String(totalPages),
    hasNext: result.page < totalPages,
    hasPrevious: result.page > 1,
    items: result.items.map(map),
  };
}

/** `Role` proto: enum family dạng tên proto (`FAMILY_ADMIN`, DEV-197-02), int64 dạng chuỗi. */
function roleMessage(role: RoleView): object {
  const message: Record<string, unknown> = {
    id: role.id,
    name: role.name,
    family: w02EnumAdapter('Role.family').toWire(role.family),
    level: String(role.level),
    builtIn: role.builtIn,
    authorityCodes: role.authorityCodes,
    version: String(role.version),
  };
  if (role.description !== undefined) message.description = role.description;
  return message;
}

function actionResult(outcome: RoleActionOutcome, traceId: string): object {
  return { id: outcome.id, version: String(outcome.version), status: outcome.status, traceId };
}

type Guarded = (
  rpc: string,
  run: (request: RawRequest, actor: V1Actor, context: StorageCallContext) => Promise<object>,
) => RpcRun;

function roleRuns(roles: RoleV1Service, guarded: Guarded): Record<string, RpcRun> {
  return {
    ListRoles: guarded('ListRoles', async (request) =>
      page(await roles.list(parseListQuery(request, ['createdAt', 'name'])), roleMessage),
    ),
    GetRole: guarded('GetRole', async (request) =>
      roleMessage(await roles.get(parseUuid(request.id))),
    ),
    UpdateRole: guarded('UpdateRole', async (request, actor) =>
      roleMessage(
        await roles.update(actor, parseUuid(request.id), parsePatch(request, ROLE_PATCH_RULES)),
      ),
    ),
    DeleteRole: guarded('DeleteRole', async (request, actor, context) =>
      actionResult(
        await roles.remove(actor, parseUuid(request.id), parseVersion(request.version)),
        context.traceId,
      ),
    ),
  };
}

function authorityRuns(
  roles: RoleV1Service,
  authorities: AuthorityV1Service,
  guarded: Guarded,
): Record<string, RpcRun> {
  return {
    ListAuthorities: guarded('ListAuthorities', async (request) =>
      page(
        await authorities.list(parseListQuery(request, ['createdAt', 'code', 'name'])),
        (a) => a,
      ),
    ),
    ListAuthorityGroups: guarded('ListAuthorityGroups', async (request) =>
      page(await authorities.listGroups(parseListQuery(request, ['createdAt', 'name'])), (g) => g),
    ),
    UpdateAuthorityMetadata: guarded('UpdateAuthorityMetadata', async (request) =>
      authorities.updateMetadata(parseUuid(request.id), parsePatch(request, AUTHORITY_PATCH_RULES)),
    ),
    PutRoleAuthority: guarded('PutRoleAuthority', async (request, actor, context) =>
      actionResult(
        await roles.grant(actor, parseUuid(request.id), parseAuthorityCode(request.authorityCode)),
        context.traceId,
      ),
    ),
    DeleteRoleAuthority: guarded('DeleteRoleAuthority', async (request, actor, context) =>
      actionResult(
        await roles.revoke(
          actor,
          parseUuid(request.id),
          parseAuthorityCode(request.authorityCode),
          parseVersion(request.version),
        ),
        context.traceId,
      ),
    ),
  };
}

/**
 * Handler Storage RBAC v1 (W02 I-03a): mỗi RPC xác thực JWT + phiên (`strict`), đọc actor + quyền từ DB, kiểm
 * `x-authority` + family ceiling (`assertAuthorized`, không bypass SUPER_ADMIN — F-196-04), rồi mới đọc/ghi.
 */
export function createStorageRbacHandlers(
  deps: StorageRbacHandlerDependencies,
): UntypedServiceImplementation {
  const { sessions, roles, authorities, dataSource } = deps;
  const guarded: Guarded = (rpc, run) =>
    authenticated(sessions, 'strict', async (request, principal: SessionPrincipal, context) => {
      const actor = await resolveActor(dataSource, principal);
      assertAuthorized(actor, RBAC_RPC_AUTHORITY[rpc]);
      return run(request, actor, context);
    });

  const runs: Record<string, RpcRun> = {
    ...roleRuns(roles, guarded),
    ...authorityRuns(roles, authorities, guarded),
  };
  return Object.fromEntries(
    Object.entries(runs).map(([rpc, run]) => [rpc, unaryHandler(deps, rpc, run)]),
  );
}
