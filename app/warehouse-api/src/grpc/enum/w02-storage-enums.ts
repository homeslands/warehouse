import { PackageDefinition } from '@grpc/proto-loader';
import { rpcNameForOperation } from 'src/shared/grpc/storage-proto';
import { getStorageProto } from '../storage-proto.runtime';
import { StorageEnumAdapter, StorageEnumSpec } from './storage-enum.adapter';

/**
 * Giá trị OpenAPI R2 của các enum trong 37 operation W02 (W02-BE-01 mục 2a). Đây là phía HTTP của
 * contract; phía proto lấy từ descriptor. `w02-storage-enums.spec.ts` đối chiếu các danh sách này với
 * `openapi-v1.json` và mọi enum field trong RPC W02 của proto.
 */
export const ROLE_FAMILY_VALUES = ['ADMIN', 'MANAGER', 'SUPERVISOR'] as const;
export const ROLE_WRITE_FAMILY_VALUES = ['MANAGER', 'SUPERVISOR'] as const;
export const FILE_PURPOSE_VALUES = ['GENERIC', 'FINANCIAL_ATTACHMENT', 'EXCEL_IMPORT'] as const;
export const FILE_STATUS_VALUES = ['UNATTACHED', 'ATTACHED', 'REJECTED'] as const;
export const JOB_STATUS_VALUES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const;
export const AUDIT_ACTOR_TYPE_VALUES = ['USER', 'SYSTEM'] as const;
export const TECHNICAL_LOG_LEVEL_VALUES = ['INFO', 'WARN', 'ERROR'] as const;
export const LIST_SORT_BY_VALUES = ['createdAt', 'code', 'name'] as const;
export const LIST_SORT_VALUES = ['ASC', 'DESC'] as const;

/** operationId W02 có query `sortBy`/`sort` (message request riêng, enum lồng riêng). */
const LIST_OPERATIONS = [
  'listOwnSessions',
  'listUsers',
  'listRoles',
  'listAuthorities',
  'listAuthorityGroups',
  'listAuditEvents',
  'listTechnicalLogs',
  'listBackupRequests',
] as const;
export type W02ListOperation = (typeof LIST_OPERATIONS)[number];

const requestMessage = (operationId: string) => `${rpcNameForOperation(operationId)}Request`;

/**
 * Key = vị trí enum trong OpenAPI: `<Schema>.<property>` hoặc `<operationId>?<queryParam>`.
 * Riêng `uploadFile` body `purpose`: proto `FileUploadHeader.purpose` là `string`, không phải enum ⇒
 * không có adapter prefix ở đây (câu hỏi mở cho I-04, xem handoff I-01b).
 */
export const W02_ENUM_SPECS: Readonly<Record<string, StorageEnumSpec<string>>> = {
  'Role.family': { message: 'Role', field: 'family', apiValues: ROLE_FAMILY_VALUES },
  'RoleWrite.family': {
    message: 'RoleWrite',
    field: 'family',
    apiValues: ROLE_WRITE_FAMILY_VALUES,
  },
  'FileMetadata.purpose': {
    message: 'FileMetadata',
    field: 'purpose',
    apiValues: FILE_PURPOSE_VALUES,
  },
  'FileMetadata.status': {
    message: 'FileMetadata',
    field: 'status',
    apiValues: FILE_STATUS_VALUES,
  },
  'Job.status': { message: 'Job', field: 'status', apiValues: JOB_STATUS_VALUES },
  'AuditEvent.actorType': {
    message: 'AuditEvent',
    field: 'actorType',
    apiValues: AUDIT_ACTOR_TYPE_VALUES,
  },
  'TechnicalLog.level': {
    message: 'TechnicalLog',
    field: 'level',
    apiValues: TECHNICAL_LOG_LEVEL_VALUES,
  },
  'listTechnicalLogs?level': {
    message: 'ListTechnicalLogsRequest',
    field: 'level',
    apiValues: TECHNICAL_LOG_LEVEL_VALUES,
  },
  ...Object.fromEntries(
    LIST_OPERATIONS.flatMap((operationId) => [
      [
        `${operationId}?sortBy`,
        { message: requestMessage(operationId), field: 'sortBy', apiValues: LIST_SORT_BY_VALUES },
      ],
      [
        `${operationId}?sort`,
        { message: requestMessage(operationId), field: 'sort', apiValues: LIST_SORT_VALUES },
      ],
    ]),
  ),
};

export type W02EnumAdapters = Readonly<Record<string, StorageEnumAdapter<string>>>;

/** Dựng toàn bộ adapter W02; lệch contract ⇒ ném `StorageEnumContractError` ngay khi khởi tạo. */
export function createW02EnumAdapters(definition: PackageDefinition): W02EnumAdapters {
  return Object.fromEntries(
    Object.entries(W02_ENUM_SPECS).map(([key, spec]) => [
      key,
      new StorageEnumAdapter(definition, spec),
    ]),
  );
}

let cachedAdapters: W02EnumAdapters | undefined;

/** Adapter W02 trên proto dùng chung của tiến trình. */
export function getW02EnumAdapters(): W02EnumAdapters {
  cachedAdapters ??= createW02EnumAdapters(getStorageProto());
  return cachedAdapters;
}

/** Adapter theo key; key không có ⇒ lỗi rõ ràng (không trả undefined để tránh pass-through). */
export function w02EnumAdapter(key: string): StorageEnumAdapter<string> {
  const adapter = getW02EnumAdapters()[key];
  if (!adapter) throw new RangeError(`no W02 enum adapter for ${key}`);
  return adapter;
}
