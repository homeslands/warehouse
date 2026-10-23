/**
 * Trạng thái lô, luôn đồng bộ với `remainingQuantity`: còn hàng (`> 0`) ⇔ `InStock`. Lưu dạng số
 * (`TINYINT`) theo yêu cầu nghiệp vụ: `0` = hết hàng, `1` = còn hàng.
 */
export enum MaterialBatchStatus {
  OutOfStock = 0,
  InStock = 1,
}

export const statusOfRemaining = (remaining: number): MaterialBatchStatus =>
  remaining > 0 ? MaterialBatchStatus.InStock : MaterialBatchStatus.OutOfStock;
