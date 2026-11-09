import { useEffect } from 'react'

import { useHandOffToModal } from '@/shared/lib/useHandOffToModal'

/**
 * Link cũ `/export/create` (màn tạo đầu phiếu đã bỏ): sang bước 1 của phiếu mới (modal). Không dùng
 * `<Redirect>`: `replace` từ trong tab sang route gốc sẽ thay cả `(tabs)`.
 */
export default function CreateExportFormRoute() {
  const handOff = useHandOffToModal()
  useEffect(() => {
    handOff('/export-form/new/info')
  }, [handOff])
  return null
}
