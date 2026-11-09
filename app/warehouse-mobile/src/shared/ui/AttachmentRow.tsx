import { FileText } from './icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Image, Linking, Pressable, View } from 'react-native'

import { attachmentName, isImageAttachment, openableAttachmentUrl } from '../lib/attachment'
import { useTheme } from '../theme/useTheme'
import { Text } from './Text'
import { ROW_PRESS_DELAY_MS } from './press'

export type AttachmentRowProps = {
  /** URL (hoặc key cũ của web) của chứng từ. */
  value: string
  /** Nhãn dòng (đã dịch), vd "Chứng từ". */
  label: string
  testID?: string
}

const TILE = 36

/**
 * Dòng chứng từ chỉ đọc dưới nhóm "Thông tin" (màn xem phiếu và bước 3): ô vuông bên trái (ảnh nhỏ nếu là
 * ảnh mở được, lỗi tải hoặc không phải ảnh thì icon tệp), bên phải nhãn nhỏ + tên. Bấm mở bằng
 * `Linking.openURL` CHỈ khi giá trị là URL http(s); key cũ chỉ hiện tên (không bấm, không vai trò nút).
 */
export function AttachmentRow({ value, label, testID }: AttachmentRowProps) {
  const { colors, radius } = useTheme()
  const { t } = useTranslation('common')
  const [imageFailed, setImageFailed] = useState(false)
  const url = openableAttachmentUrl(value)
  const name = attachmentName(value)
  const showImage = url !== null && isImageAttachment(value) && !imageFailed

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View
        aria-hidden
        style={{
          width: TILE,
          height: TILE,
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: colors.fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {showImage ? (
          <Image
            source={{ uri: url }}
            testID={testID ? `${testID}-image` : undefined}
            onError={() => setImageFailed(true)}
            style={{ width: TILE, height: TILE }}
          />
        ) : (
          <FileText size={20} color={colors.foreground} strokeWidth={1.9} />
        )}
      </View>
      <View style={{ flex: 1, flexShrink: 1 }}>
        <Text size={12} style={{ color: colors.fieldLabel }}>
          {label}
        </Text>
        <Text size={14} weight="medium" numberOfLines={1} ellipsizeMode="middle">
          {name}
        </Text>
      </View>
    </View>
  )

  const box = {
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: radius.groupLarge,
    overflow: 'hidden' as const,
    justifyContent: 'center' as const,
  }

  if (url === null) {
    return (
      <View testID={testID} accessible accessibilityLabel={`${label}, ${name}`} style={box}>
        {content}
      </View>
    )
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${name}`}
      unstable_pressDelay={ROW_PRESS_DELAY_MS}
      onPress={() => {
        Linking.openURL(url).catch(() => Alert.alert(t('attachment.openFailed')))
      }}
      style={({ pressed }) => [box, pressed ? { opacity: 0.6 } : null]}
    >
      {content}
    </Pressable>
  )
}
