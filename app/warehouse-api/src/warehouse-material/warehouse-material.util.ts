import { WarehouseMaterial } from './warehouse-material.entity';

/**
 * Ngưỡng THẬT SỰ đang áp cho 1 vật tư trong 1 kho: override của kho nếu khác `null`/`undefined`,
 * ngược lại lấy ngưỡng mặc định của `Material`. Tính riêng từng vế — override 1 vế là hợp lệ.
 *
 * Cần `material` đã được load (quan hệ không `eager`); thiếu nó thì coi như không có ngưỡng mặc
 * định (`0`) thay vì ném lỗi, để 1 read path quên `relations` không làm sập cả response.
 */
export const effectiveMinimum = (row: {
  minimumInventory?: number | null;
  material?: { minimumInventory?: number } | null;
}): number => row.minimumInventory ?? row.material?.minimumInventory ?? 0;

export const effectiveMaximum = (row: {
  maximumInventory?: number | null;
  material?: { maximumInventory?: number } | null;
}): number => row.maximumInventory ?? row.material?.maximumInventory ?? 0;

export type WarehouseMaterialRow = Pick<
  WarehouseMaterial,
  'minimumInventory' | 'maximumInventory' | 'material'
>;
