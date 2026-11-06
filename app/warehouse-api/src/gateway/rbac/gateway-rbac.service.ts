import { Inject, Injectable } from '@nestjs/common';
import { w02EnumAdapter } from 'src/grpc/enum/w02-storage-enums';
import { StorageGrpcClient } from 'src/grpc/gateway/storage-grpc.client';
import { Clock } from 'src/session/session.policy';
import { v1Success, V1SuccessEnvelope } from 'src/shared/api-v1/envelope';
import { toActionResult, toPage, V1ActionResult, V1Page } from '../auth/gateway-auth.mapper';
import { V1ListOwnSessionsQueryDto } from '../auth/gateway-auth.dto';
import { GatewayAccessVerifier } from '../gateway-access';
import { GATEWAY_CLOCK } from '../gateway.constants';
import { GatewayRequestContext } from '../gateway-request';
import { V1AuthorityPatchDto, V1RolePatchDto } from './gateway-rbac.dto';
import {
  toAuthority,
  toAuthorityGroup,
  toRole,
  V1Authority,
  V1AuthorityGroup,
  V1Role,
} from './gateway-rbac.mapper';

interface RpcEnvelope {
  result?: unknown;
}

const OK = 200;
type ListOperation = 'listRoles' | 'listAuthorities' | 'listAuthorityGroups';

/**
 * PATCH → `data` + FieldMask (`data.<field>`, architecture "Wire contracts"). Chỉ field client gửi (khác
 * `undefined`) vào mask; `version` luôn ở `data`. `clear_fields` rỗng: các field này không nullable (Gateway đã
 * từ chối `null`).
 */
function patchRequest(id: string, dto: object): object {
  const data: Record<string, unknown> = {};
  const paths: string[] = [];
  for (const [key, value] of Object.entries(dto)) {
    if (value === undefined) continue;
    data[key] = key === 'version' ? String(value) : value;
    if (key !== 'version') paths.push(`data.${key}`);
  }
  return { id, data, updateMask: { paths }, clearFields: [] };
}

/**
 * HTTP v1 cho role/authority/permission (W02 I-03a). Gateway chỉ kiểm JWT + định dạng; quyền (`x-authority`,
 * family ceiling, level) do Storage quyết. Không có repository ở đây.
 */
@Injectable()
export class GatewayRbacService {
  constructor(
    @Inject(GATEWAY_CLOCK) private readonly clock: Clock,
    private readonly storage: StorageGrpcClient,
    private readonly access: GatewayAccessVerifier,
  ) {}

  listRoles(
    auth: string | undefined,
    query: V1ListOwnSessionsQueryDto,
    context: GatewayRequestContext,
  ): Promise<V1SuccessEnvelope<V1Page<V1Role>>> {
    return this.list('listRoles', 'ListRoles', auth, query, context, toRole);
  }

  async getRole(
    auth: string | undefined,
    id: string,
    context: GatewayRequestContext,
  ): Promise<V1SuccessEnvelope<V1Role>> {
    const response = await this.call('GetRole', { id }, auth, context);
    return this.ok(toRole(response.result), context, 'Role');
  }

  async updateRole(
    auth: string | undefined,
    id: string,
    dto: V1RolePatchDto,
    context: GatewayRequestContext,
  ): Promise<V1SuccessEnvelope<V1Role>> {
    const response = await this.call('UpdateRole', patchRequest(id, dto), auth, context);
    return this.ok(toRole(response.result), context, 'Role updated');
  }

  async deleteRole(
    auth: string | undefined,
    id: string,
    version: number,
    context: GatewayRequestContext,
  ): Promise<V1SuccessEnvelope<V1ActionResult>> {
    const response = await this.call('DeleteRole', { id, version: String(version) }, auth, context);
    return this.ok(toActionResult(response.result, context.traceId), context, 'Role deleted');
  }

  listAuthorities(
    auth: string | undefined,
    query: V1ListOwnSessionsQueryDto,
    context: GatewayRequestContext,
  ): Promise<V1SuccessEnvelope<V1Page<V1Authority>>> {
    return this.list('listAuthorities', 'ListAuthorities', auth, query, context, toAuthority);
  }

  listAuthorityGroups(
    auth: string | undefined,
    query: V1ListOwnSessionsQueryDto,
    context: GatewayRequestContext,
  ): Promise<V1SuccessEnvelope<V1Page<V1AuthorityGroup>>> {
    return this.list(
      'listAuthorityGroups',
      'ListAuthorityGroups',
      auth,
      query,
      context,
      toAuthorityGroup,
    );
  }

  async updateAuthorityMetadata(
    auth: string | undefined,
    id: string,
    dto: V1AuthorityPatchDto,
    context: GatewayRequestContext,
  ): Promise<V1SuccessEnvelope<V1Authority>> {
    const response = await this.call(
      'UpdateAuthorityMetadata',
      patchRequest(id, dto),
      auth,
      context,
    );
    return this.ok(toAuthority(response.result), context, 'Authority updated');
  }

  async putRoleAuthority(
    auth: string | undefined,
    id: string,
    code: string,
    context: GatewayRequestContext,
  ): Promise<V1SuccessEnvelope<V1ActionResult>> {
    const response = await this.call(
      'PutRoleAuthority',
      { id, authorityCode: code },
      auth,
      context,
    );
    return this.ok(toActionResult(response.result, context.traceId), context, 'Authority granted');
  }

  async deleteRoleAuthority(
    auth: string | undefined,
    id: string,
    code: string,
    version: number,
    context: GatewayRequestContext,
  ): Promise<V1SuccessEnvelope<V1ActionResult>> {
    const response = await this.call(
      'DeleteRoleAuthority',
      { id, authorityCode: code, version: String(version) },
      auth,
      context,
    );
    return this.ok(toActionResult(response.result, context.traceId), context, 'Authority revoked');
  }

  private async list<T>(
    operation: ListOperation,
    rpc: string,
    auth: string | undefined,
    query: V1ListOwnSessionsQueryDto,
    context: GatewayRequestContext,
    map: (item: unknown) => T,
  ): Promise<V1SuccessEnvelope<V1Page<T>>> {
    const request: Record<string, unknown> = {};
    if (query.page !== undefined) request.page = String(query.page);
    if (query.pageSize !== undefined) request.pageSize = String(query.pageSize);
    if (query.q !== undefined) request.q = query.q;
    if (query.sortBy !== undefined)
      request.sortBy = w02EnumAdapter(`${operation}?sortBy`).toWire(query.sortBy);
    if (query.sort !== undefined)
      request.sort = w02EnumAdapter(`${operation}?sort`).toWire(query.sort);
    const response = await this.call(rpc, request, auth, context);
    return this.ok(toPage(response.result, `${operation} result`, map), context, 'OK');
  }

  private call(
    rpc: string,
    request: object,
    auth: string | undefined,
    context: GatewayRequestContext,
  ): Promise<RpcEnvelope> {
    return this.storage.unary<RpcEnvelope>(rpc, request, {
      traceId: context.traceId,
      authorization: this.access.verify(auth),
      client: { ip: context.ip, userAgent: context.userAgent },
    });
  }

  private ok<T>(result: T, context: GatewayRequestContext, message: string): V1SuccessEnvelope<T> {
    return v1Success(result, context.traceId, message, OK, this.clock.now());
  }
}
