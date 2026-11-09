import { useEffect } from 'react'

import { useHandOffToModal } from '@/shared/lib/useHandOffToModal'

/**
 * Link cũ `/import/create` (màn tạo đầu phiếu đã bỏ): sang bước 1 của phiếu mới (modal). Không dùng
 * `<Redirect>`: `replace` từ trong tab sang route gốc sẽ thay cả `(tabs)`.
 */
export default function CreateImportFormRoute() {
  const handOff = useHandOffToModal()
  useEffect(() => {
    handOff('/import-form/new/info')
  }, [handOff])
  return null
}
