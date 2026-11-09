import { useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'

import { useHandOffToModal } from '@/shared/lib/useHandOffToModal'

/** Link cũ `/import/[formSlug]/info` (bước trong tab): chuyển sang modal `/import-form/[formSlug]/info`. */
export default function LegacyImportInfoStepRoute() {
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const handOff = useHandOffToModal()
  useEffect(() => {
    handOff({ pathname: '/import-form/[formSlug]/info', params: { formSlug } })
  }, [handOff, formSlug])
  return null
}
