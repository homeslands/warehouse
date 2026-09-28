import { SlidersHorizontalIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useIsMobile } from '@/shared/lib/use-mobile'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet'

type ListToolbarProps = {
  /** Trái: ô tìm kiếm (nếu có). */
  search?: ReactNode
  /** Phải, trước nút hành động: bộ lọc. */
  filters?: ReactNode
  /** Phải ngoài cùng: nút hành động (Tạo, Xuất...). */
  actions?: ReactNode
  /**
   * Màn < 768px gom bộ lọc vào nút "Bộ lọc" mở ngăn trượt từ dưới lên. Bật khi có từ hai bộ lọc
   * trở lên — một ô lọc thì cứ để thẳng trên thanh, gom lại chỉ thêm một cú bấm.
   */
  collapseFiltersOnMobile?: boolean
  /** Số bộ lọc đang áp dụng — hiện thành số trên nút "Bộ lọc" khi đã gom. */
  activeFilterCount?: number
}

/**
 * Khung bố cục thanh trên bảng: ô tìm bên trái; bộ lọc rồi nút hành động dồn sang phải — không có ô
 * tìm thì cả cụm vẫn nằm bên phải. Không giữ trạng thái — bộ lọc sống trên URL (useListParams).
 */
export function ListToolbar({
  search,
  filters,
  actions,
  collapseFiltersOnMobile = false,
  activeFilterCount = 0,
}: ListToolbarProps) {
  const { t } = useTranslation(['common'])
  const isMobile = useIsMobile()
  const collapse = collapseFiltersOnMobile && isMobile && filters

  return (
    <div className="flex flex-wrap items-center gap-2">
      {search && <div className="w-full min-w-0 sm:w-auto sm:flex-1">{search}</div>}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {collapse ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">
                <SlidersHorizontalIcon aria-hidden />
                {t('common:filters')}
                {activeFilterCount > 0 && (
                  <Badge
                    variant="secondary"
                    aria-label={t('common:filtersActive', { count: activeFilterCount })}
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85svh]">
              <SheetHeader>
                <SheetTitle>{t('common:filters')}</SheetTitle>
                <SheetDescription>{t('common:filtersDescription')}</SheetDescription>
              </SheetHeader>
              {/* Bộ lọc đổi URL ngay khi chọn — không cần nút "Áp dụng"; đóng ngăn là xong. */}
              <div className="flex flex-col items-stretch gap-3 overflow-y-auto px-4 pb-6 *:w-full">
                {filters}
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          filters
        )}
        {actions}
      </div>
    </div>
  )
}
