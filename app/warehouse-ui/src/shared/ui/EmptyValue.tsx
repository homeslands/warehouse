import { useTranslation } from 'react-i18next'

/**
 * Ô không có giá trị trong bảng / trang chi tiết: chữ xám "Chưa có" (en "Not set"). Không dùng "—"
 * (dễ đọc nhầm là lỗi hiển thị) hay "N/A" (nghĩa là "không áp dụng", khác "chưa nhập"). Trường đã có câu
 * riêng thì dùng câu đó (vd "Chưa có quản lý", "Chưa gán kho").
 */
export function EmptyValue() {
  const { t } = useTranslation(['common'])
  return <span className="text-muted-foreground">{t('common:notSet')}</span>
}
