import { useTranslation } from 'react-i18next'
import { canSearchByCode, type CodeOrNameField } from '@/shared/lib/code'
import { Button } from '@/shared/ui/button'

type Props = {
  /** Câu báo trống đã dịch ("Không có … mang mã “X”"). */
  message: string
  /** Trường vừa tìm (kết quả của `toCodeOrNameQuery`). */
  searchedBy: CodeOrNameField
  /** Chữ người dùng gõ — quyết định có cho đổi sang "Tìm theo mã" không. */
  search: string | undefined
  onSwitch: (field: CodeOrNameField) => void
}

/**
 * Câu báo trống của ô tìm "mã hoặc tên" (`toCodeOrNameQuery`) kèm nút đổi cách tìm khi phần đoán có thể sai: vừa
 * tìm theo mã → luôn cho tìm theo tên; vừa tìm theo tên mà chuỗi có thể là mã (một từ Latin) → cho tìm theo mã.
 */
export function CodeOrNameEmpty({ message, searchedBy, search, onSwitch }: Props) {
  const { t } = useTranslation(['common'])
  const other: CodeOrNameField = searchedBy === 'code' ? 'name' : 'code'
  const canSwitch = other === 'name' || canSearchByCode(search)
  return (
    <>
      {message}
      {canSwitch && (
        <>
          {' '}
          <Button variant="link" className="h-auto p-0" onClick={() => onSwitch(other)}>
            {other === 'code' ? t('common:searchAsCode') : t('common:searchAsName')}
          </Button>
        </>
      )}
    </>
  )
}
