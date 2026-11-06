import { DataSource, Equal, Like } from 'typeorm';
import { escapeLike } from 'src/shared/utils/query.util';
import { V1AuthorityGroupRecord, V1AuthorityRecord } from './rbac-v1-records.entity';
import { ListQuery, PatchInput } from './rbac-v1.request';
import { RbacException, RbacValidation } from './rbac-v1.validation';
import { Page } from './role-v1.service';

/** OpenAPI `Authority` (không có `id`; PATCH dùng `{id}` UUID của authority). */
export interface AuthorityView {
  code: string;
  name: string;
  groupId: string;
  fixedInvariant: boolean;
}

/**
 * `NamedMaster` cho authority group — CHỈ các field có nguồn: `authority_group_tbl` không có `code`, `version`,
 * `isActive` (OpenAPI required) ⇒ chưa trả (PARTIAL, DEV-197-22), không bịa (vd không lấy slug ngẫu nhiên làm code).
 */
export interface AuthorityGroupView {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

const LOCK = { mode: 'pessimistic_write' } as const;

/** Authority / authority group v1 phía Storage (W02 I-03a). Mã quyền (`code`) bất biến, không tạo lúc runtime. */
export class AuthorityV1Service {
  constructor(private readonly dataSource: DataSource) {}

  async list(query: ListQuery): Promise<Page<AuthorityView>> {
    const like = query.q ? Like(`%${escapeLike(query.q)}%`) : undefined;
    const [records, total] = await this.dataSource.getRepository(V1AuthorityRecord).findAndCount({
      where: like ? [{ code: like }, { name: like }] : {},
      order: { [query.sortBy]: query.sort, id: 'ASC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return {
      items: records.map(toAuthorityView),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async listGroups(query: ListQuery): Promise<Page<AuthorityGroupView>> {
    const [records, total] = await this.dataSource
      .getRepository(V1AuthorityGroupRecord)
      .findAndCount({
        where: query.q ? { name: Like(`%${escapeLike(query.q)}%`) } : {},
        order: { [query.sortBy]: query.sort, id: 'ASC' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
    return {
      items: records.map((record) => ({
        id: record.id,
        name: record.name,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Sửa metadata (tên, nhóm) — không đổi `code`, không cấp quyền. Khoá + kiểm version trong transaction. */
  async updateMetadata(id: string, patch: PatchInput<'name' | 'groupId'>): Promise<AuthorityView> {
    return this.dataSource.transaction(async (manager) => {
      const authority = await manager.findOne(V1AuthorityRecord, {
        where: { id: Equal(id) },
        lock: LOCK,
      });
      if (!authority) throw new RbacException(RbacValidation.RBAC_AUTHORITY_NOT_FOUND);
      if (authority.version !== patch.version)
        throw new RbacException(RbacValidation.RBAC_VERSION_CONFLICT);
      const { name, groupId } = patch.fields;
      if (groupId !== undefined) {
        const group = await manager.findOne(V1AuthorityGroupRecord, {
          where: { id: Equal(groupId.toLowerCase()) },
        });
        if (!group)
          throw new RbacException(RbacValidation.RBAC_REQUEST_INVALID, [
            { field: 'groupId', errorKey: 'RBAC_GROUP_INVALID', message: 'groupId does not exist' },
          ]);
        authority.groupId = group.id;
      }
      if (name !== undefined) authority.name = name;
      authority.version += 1;
      await manager.update(
        V1AuthorityRecord,
        { id: Equal(authority.id) },
        { name: authority.name, groupId: authority.groupId, version: authority.version },
      );
      return toAuthorityView(authority);
    });
  }
}

function toAuthorityView(record: V1AuthorityRecord): AuthorityView {
  return {
    code: record.code,
    name: record.name,
    groupId: record.groupId,
    fixedInvariant: record.fixedInvariant,
  };
}
