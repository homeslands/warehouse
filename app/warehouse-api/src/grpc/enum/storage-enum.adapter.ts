import { PackageDefinition } from '@grpc/proto-loader';
import { STORAGE_PACKAGE } from 'src/shared/grpc/storage-proto';

/**
 * Adapter enum OpenAPI ↔ proto (DEV-197-02). Trên dây, enum là TÊN trong proto có prefix
 * (`FAMILY_ADMIN`, `SORT_BY_CREATEDAT`); OpenAPI dùng giá trị không prefix (`ADMIN`, `createdAt`).
 *
 * Mapping không viết tay từng cặp: adapter đọc enum từ descriptor của proto đã nạp
 * (`<Message>.<field>` → enum type → value), suy prefix từ giá trị số 0 `<PREFIX>UNSPECIFIED`, và
 * dựng `wire = PREFIX + api.toUpperCase()`. Khi khởi tạo, kiểm song ánh: mỗi giá trị OpenAPI phải trúng
 * đúng 1 giá trị proto và mọi giá trị proto (trừ UNSPECIFIED) phải được dùng — lệch ⇒ lỗi ngay.
 * Giá trị lạ ở cả 2 chiều (kể cả `*_UNSPECIFIED`) ⇒ `StorageEnumMappingError`, không pass-through.
 */
export class StorageEnumContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageEnumContractError';
  }
}

export class StorageEnumMappingError extends Error {
  constructor(
    readonly enumName: string,
    readonly direction: 'toWire' | 'toApi',
  ) {
    super(`Unmapped value for ${enumName} (${direction})`);
    this.name = 'StorageEnumMappingError';
  }
}

interface EnumValueDescriptor {
  name: string;
  number: number;
}
interface EnumDescriptor {
  name: string;
  value: EnumValueDescriptor[];
}
interface FieldDescriptor {
  name: string;
  type: string;
  typeName: string;
}
interface MessageDescriptor {
  field: FieldDescriptor[];
  enumType: EnumDescriptor[];
}

const UNSPECIFIED_SUFFIX = 'UNSPECIFIED';

export interface StorageEnumSpec<TApi extends string> {
  /** Tên message trong package `warehouse.storage.v1` (có thể lồng: `Outer.Inner`). */
  message: string;
  /** Tên field theo descriptor (camelCase, vì `keepCase: false`). */
  field: string;
  /** Giá trị OpenAPI R2 của field này. */
  apiValues: readonly TApi[];
}

function messageDescriptor(definition: PackageDefinition, fullName: string): MessageDescriptor {
  const entry = definition[fullName];
  if (!entry || !('format' in entry) || typeof entry.format !== 'string')
    throw new StorageEnumContractError(`proto message ${fullName} not found`);
  return entry.type as MessageDescriptor;
}

/** Enum type của field: enum lồng trong message, hoặc enum cấp package / tên đầy đủ. */
function resolveEnum(definition: PackageDefinition, messageName: string, typeName: string) {
  const owner = messageDescriptor(definition, messageName);
  const nested = owner.enumType.find((candidate) => candidate.name === typeName);
  if (nested) return { fullName: `${messageName}.${typeName}`, descriptor: nested };
  const fullName = typeName.startsWith('.') ? typeName.slice(1) : `${STORAGE_PACKAGE}.${typeName}`;
  const entry = definition[fullName];
  if (entry && 'type' in entry && 'value' in (entry.type as object))
    return { fullName, descriptor: entry.type as EnumDescriptor };
  throw new StorageEnumContractError(`enum ${typeName} of ${messageName} not found`);
}

function enumPrefix(fullName: string, values: EnumValueDescriptor[]): string {
  const zero = values.find((value) => value.number === 0);
  if (!zero?.name.endsWith(UNSPECIFIED_SUFFIX))
    throw new StorageEnumContractError(`${fullName} has no <PREFIX>UNSPECIFIED = 0`);
  return zero.name.slice(0, -UNSPECIFIED_SUFFIX.length);
}

export class StorageEnumAdapter<TApi extends string> {
  readonly enumName: string;
  readonly prefix: string;
  readonly apiValues: readonly TApi[];
  private readonly toWireMap = new Map<string, string>();
  private readonly toApiMap = new Map<string, TApi>();

  constructor(definition: PackageDefinition, spec: StorageEnumSpec<TApi>) {
    const messageName = `${STORAGE_PACKAGE}.${spec.message}`;
    const field = messageDescriptor(definition, messageName).field.find(
      (candidate) => candidate.name === spec.field,
    );
    if (field?.type !== 'TYPE_ENUM')
      throw new StorageEnumContractError(`${messageName}.${spec.field} is not an enum field`);
    const { fullName, descriptor } = resolveEnum(definition, messageName, field.typeName);
    this.enumName = fullName;
    this.prefix = enumPrefix(fullName, descriptor.value);
    this.apiValues = [...spec.apiValues];
    this.buildMaps(descriptor.value);
  }

  private buildMaps(values: EnumValueDescriptor[]): void {
    const wireNames = new Set(values.filter((value) => value.number !== 0).map((v) => v.name));
    for (const api of this.apiValues) {
      const wire = `${this.prefix}${api.toUpperCase()}`;
      if (!wireNames.has(wire) || this.toApiMap.has(wire))
        throw new StorageEnumContractError(
          `${this.enumName}: OpenAPI value ${api} has no proto value`,
        );
      this.toWireMap.set(api, wire);
      this.toApiMap.set(wire, api);
    }
    const unused = [...wireNames].filter((wire) => !this.toApiMap.has(wire));
    if (unused.length)
      throw new StorageEnumContractError(`${this.enumName}: proto values ${unused} not in OpenAPI`);
  }

  /** Giá trị OpenAPI → tên proto trên dây. */
  toWire(value: unknown): string {
    const wire = typeof value === 'string' ? this.toWireMap.get(value) : undefined;
    if (wire === undefined) throw new StorageEnumMappingError(this.enumName, 'toWire');
    return wire;
  }

  /** Tên proto trên dây → giá trị OpenAPI. `*_UNSPECIFIED` hoặc giá trị lạ ⇒ lỗi. */
  toApi(value: unknown): TApi {
    const api = typeof value === 'string' ? this.toApiMap.get(value) : undefined;
    if (api === undefined) throw new StorageEnumMappingError(this.enumName, 'toApi');
    return api;
  }
}
