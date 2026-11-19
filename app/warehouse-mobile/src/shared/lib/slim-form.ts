/** Phiếu ĐÃ XÁC NHẬN ở dạng gọn (tab Tổng quan): chỉ những trường cần để gom theo kỳ và liệt kê. */
export type SlimForm = {
  slug: string
  code: string
  createdAt: string
  amount: number
  /** Bên liên quan để hiện trên dòng (phiếu nhập: người lập; phiếu xuất: bên nhận). */
  party: string | null
  kind: 'import' | 'export'
}
