import { useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'

import { useHandOffToModal } from '@/shared/lib/useHandOffToModal'

/** Link cũ `/export/[formSlug]/info` (bước trong tab): chuyển sang modal `/export-form/[formSlug]/info`. */
export default function LegacyExportInfoStepRoute() {
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const handOff = useHandOffToModal()
  useEffect(() => {
    handOff({ pathname: '/export-form/[formSlug]/info', params: { formSlug } })
  }, [handOff, formSlug])
  return null
}
