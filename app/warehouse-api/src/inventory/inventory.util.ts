import { Inventory } from './inventory.entity';

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

/**
 * Ngưỡng tối đa hiệu lực: `0` là không giới hạn (quy ước BA) ⇒ trả `null` khi `<= 0`.
 * Kho đặt override `0` cũng có nghĩa là bỏ giới hạn tối đa tại kho đó (khác `null` là dùng mặc định của `Material`).
 */
export const effectiveMaximum = (row: {
  maximumInventory?: number | null;
  material?: { maximumInventory?: number } | null;
}): number | null => {
  const max = row.maximumInventory ?? row.material?.maximumInventory ?? 0;
  return max > 0 ? max : null;
};

export type InventoryRow = Pick<Inventory, 'minimumInventory' | 'maximumInventory' | 'material'>;
