import { useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'

import { useHandOffToModal } from '@/shared/lib/useHandOffToModal'

/** Link cũ `/export/[formSlug]/review` (bước trong tab): chuyển sang modal `/export-form/[formSlug]/review`. */
export default function LegacyExportReviewStepRoute() {
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const handOff = useHandOffToModal()
  useEffect(() => {
    handOff({ pathname: '/export-form/[formSlug]/review', params: { formSlug } })
  }, [handOff, formSlug])
  return null
}
