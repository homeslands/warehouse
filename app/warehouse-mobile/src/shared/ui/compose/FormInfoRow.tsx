import { ChevronDown, ChevronRight } from '../icons'
import { useCallback, useEffect, useRef, type ReactNode, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputInstance,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { useRevealInput } from '../../lib/keyboard'
import { codeStyle, fontStyle } from '../../theme/fonts'
import { useTheme } from '../../theme/useTheme'
import { Text } from '../Text'
import { ROW_PRESS_DELAY_MS } from '../press'

type CommonProps = {
  label: string
  /** Trống + required: chấm cam trước nhãn, giá trị/placeholder "Bắt buộc" màu cảnh báo. */
  required?: boolean
  /** Không kẻ trên (dòng đầu nhóm). */
  first?: boolean
  error?: string | null
  /** Nháy nền ~600ms (vd sau khi "Tới" mục còn thiếu). Reduce Motion: không hiệu ứng. */
  highlighted?: boolean
  testID?: string
}

type InputProps = {
  kind: 'input'
  value: string
  onChangeText: (s: string) => void
  placeholder?: string
  autoCapitalize?: 'none' | 'characters' | 'sentences'
  keyboardType?: KeyboardTypeOptions
  maxLength?: number
  multiline?: boolean
  code?: boolean
  /** `false`: không gõ được (vd đang ghi phiếu lên server). */
  editable?: boolean
  onFocus?: () => void
  onBlur?: () => void
  inputRef?: Ref<TextInputInstance>
}
type PickerProps = {
  kind: 'picker'
  value: string | null
  onPress: () => void
  chevron?: 'down' | 'right'
  /** Giá trị chữ accent (nút chọn kiểu iOS: "Sản xuất ⌄"). */
  accentValue?: boolean
  /** Hàng bung / thu một cụm lựa chọn ngay dưới (Android): `accessibilityState.expanded`. */
  expanded?: boolean
  /**
   * Khoá (vd đang ghi phiếu): không bấm được, `accessibilityState.disabled`, giá trị chữ thường (không
   * accent), không mũi tên. Không truyền → như cũ (không có `disabled` trong `accessibilityState`).
   */
  disabled?: boolean
}
type ReadonlyProps = { kind: 'readonly'; value: string | null }
type CustomProps = {
  kind: 'custom'
  /** Nửa phải của dòng (ô nhập, stepper, nút…); tự mang nhãn a11y — nhãn trái chỉ để nhìn. */
  children: ReactNode
}

export type FormInfoRowProps = CommonProps &
  (InputProps | PickerProps | ReadonlyProps | CustomProps)

const HIGHLIGHT_MS = 600
const VALUE_TEXT = { textAlign: 'right', fontSize: 15 } as const
const ROW_STYLE = {
  minHeight: 44,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  paddingRight: 14,
} as const

/**
 * Một dòng "nhãn trái — giá trị phải" của màn soạn phiếu (kiểu Cài đặt iOS). Ba kiểu: `input` (gõ ngay
 * trong dòng), `picker` (bấm mở lựa chọn), `readonly`. Tự kẻ đường trên (trừ `first`), nên đặt thẳng
 * trong thẻ nền `card` bo góc, không cần `ListGroup`.
 */
export function FormInfoRow(props: FormInfoRowProps) {
  if (props.kind === 'input') return <InputRow {...props} />
  if (props.kind === 'picker') return <PickerRow {...props} />
  if (props.kind === 'custom') return <CustomRow {...props} />
  return <ReadonlyRow {...props} />
}

/** Khung chung: đường kẻ, chấm "bắt buộc", nền nháy, câu lỗi dưới dòng. */
function RowFrame({
  label,
  needs,
  first,
  error,
  highlighted,
  testID,
  children,
}: Pick<CommonProps, 'label' | 'first' | 'error' | 'highlighted' | 'testID'> & {
  /** Bắt buộc mà còn trống. */
  needs: boolean
  /** Phần nằm trong dòng: nhãn + giá trị (+ mũi tên). Hàng tự bọc `Pressable`/`View` theo kiểu. */
  children: (cells: { labelCell: ReactNode }) => ReactNode
}) {
  const { colors } = useTheme()
  const reduced = useReducedMotion()
  const flash = useSharedValue(0)
  useEffect(() => {
    if (!highlighted || reduced) return
    flash.value = 1
    flash.value = withTiming(0, { duration: HIGHLIGHT_MS })
  }, [highlighted, reduced, flash])
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }))

  const labelCell = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 }}>
      {needs ? (
        <View
          testID={testID ? `${testID}-dot` : undefined}
          style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warningText }}
        />
      ) : null}
      <Text>{label}</Text>
    </View>
  )
  return (
    <View testID={testID}>
      <View
        style={{
          marginLeft: 16,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: colors.separator,
        }}
      >
        {highlighted && !reduced ? (
          <Animated.View
            testID={testID ? `${testID}-highlight` : undefined}
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { marginLeft: -16, backgroundColor: colors.cellPressed },
              flashStyle,
            ]}
          />
        ) : null}
        {children({ labelCell })}
      </View>
      {error ? (
        <Text
          size={13}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{
            color: colors.destructiveText,
            marginLeft: 16,
            paddingRight: 14,
            paddingBottom: 8,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  )
}

/** Chữ giá trị / chữ thay thế ("Bắt buộc" cam, "Tuỳ chọn" mờ) của picker và readonly. */
function useEmpty(required: boolean | undefined, value: string | null) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const empty = value == null || value === ''
  const needs = !!required && empty
  return {
    empty,
    needs,
    emptyText: required ? t('common:compose.required') : t('common:compose.optional'),
    emptyColor: needs ? colors.warningText : colors.mutedForeground,
  }
}

function ValueText({
  value,
  numberOfLines,
  accent,
  ...rest
}: ReturnType<typeof useEmpty> & {
  value: string | null
  numberOfLines: number
  accent?: boolean
}) {
  const { colors } = useTheme()
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        VALUE_TEXT,
        {
          // Chiếm phần còn lại của dòng → giá trị luôn sát phải, thẳng hàng với ô nhập / mũi tên.
          flex: 1,
          flexShrink: 1,
          color: rest.empty ? rest.emptyColor : accent ? colors.accent : colors.foreground,
        },
      ]}
    >
      {rest.empty ? rest.emptyText : value}
    </Text>
  )
}

function PickerRow({
  label,
  required,
  value,
  onPress,
  chevron = 'right',
  accentValue,
  expanded,
  disabled,
  ...frame
}: CommonProps & PickerProps) {
  const { colors } = useTheme()
  const state = useEmpty(required, value)
  const Chevron = chevron === 'down' ? ChevronDown : ChevronRight
  const a11yState =
    expanded === undefined && disabled === undefined
      ? undefined
      : {
          ...(disabled === undefined ? null : { disabled }),
          ...(expanded === undefined ? null : { expanded }),
        }
  return (
    <RowFrame label={label} needs={state.needs} {...frame}>
      {({ labelCell }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={state.empty ? label : `${label}, ${value}`}
          accessibilityState={a11yState}
          disabled={disabled}
          onPress={onPress}
          unstable_pressDelay={ROW_PRESS_DELAY_MS}
          style={({ pressed }) => [
            ROW_STYLE,
            pressed && !disabled ? { backgroundColor: colors.rowPressed } : null,
          ]}
        >
          {labelCell}
          <ValueText {...state} value={value} numberOfLines={1} accent={accentValue && !disabled} />
          {disabled ? null : <Chevron size={16} color={colors.chevron} aria-hidden />}
        </Pressable>
      )}
    </RowFrame>
  )
}

function CustomRow({ label, children, ...frame }: CommonProps & CustomProps) {
  return (
    <RowFrame label={label} needs={false} {...frame}>
      {() => (
        <View style={[ROW_STYLE, { paddingVertical: 4 }]}>
          {/* Nhãn chỉ để nhìn: phần bên phải đã mang nhãn a11y riêng — VoiceOver không đọc hai lần. */}
          <Text accessible={false} importantForAccessibility="no">
            {label}
          </Text>
          {children}
        </View>
      )}
    </RowFrame>
  )
}

function ReadonlyRow({ label, required, value, ...frame }: CommonProps & ReadonlyProps) {
  const state = useEmpty(required, value)
  return (
    <RowFrame label={label} needs={state.needs} {...frame}>
      {({ labelCell }) => (
        <View
          accessible
          accessibilityLabel={state.empty ? label : `${label}, ${value}`}
          style={ROW_STYLE}
        >
          {labelCell}
          <ValueText {...state} value={value} numberOfLines={2} />
        </View>
      )}
    </RowFrame>
  )
}

function InputRow({
  label,
  required,
  value,
  onChangeText,
  placeholder,
  autoCapitalize,
  keyboardType,
  maxLength,
  multiline,
  code,
  editable,
  onFocus,
  onBlur,
  inputRef,
  testID,
  ...frame
}: CommonProps & InputProps) {
  const state = useEmpty(required, value)
  return (
    <RowFrame label={label} needs={state.needs} testID={testID} {...frame}>
      {({ labelCell }) => (
        <View style={ROW_STYLE}>
          {labelCell}
          <InfoInput
            ref={inputRef}
            testID={testID ? `${testID}-input` : undefined}
            label={label}
            value={value}
            onChangeText={onChangeText}
            placeholder={state.needs ? state.emptyText : (placeholder ?? state.emptyText)}
            placeholderTextColor={state.emptyColor}
            autoCapitalize={autoCapitalize}
            keyboardType={keyboardType}
            maxLength={maxLength}
            multiline={multiline}
            code={code}
            editable={editable}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </View>
      )}
    </RowFrame>
  )
}

/** Ô nhập trong dòng; nhận focus thì báo vùng cuộn đưa nó lên trên bàn phím. */
function InfoInput({
  label,
  placeholderTextColor,
  multiline,
  code,
  onFocus,
  onBlur,
  ref,
  ...rest
}: Pick<
  InputProps,
  | 'value'
  | 'onChangeText'
  | 'autoCapitalize'
  | 'keyboardType'
  | 'maxLength'
  | 'multiline'
  | 'code'
  | 'editable'
> &
  Pick<InputProps, 'onFocus' | 'onBlur'> & {
    label: string
    placeholder: string
    placeholderTextColor: string
    testID?: string
    ref?: Ref<TextInputInstance>
  }) {
  const { colors } = useTheme()
  const reveal = useRevealInput()
  const input = useRef<TextInputInstance | null>(null)
  const setRef = useCallback(
    (node: TextInputInstance | null) => {
      input.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )
  return (
    <TextInput
      {...rest}
      ref={setRef}
      accessibilityLabel={label}
      placeholderTextColor={placeholderTextColor}
      multiline={multiline}
      onFocus={() => {
        if (reveal && input.current) reveal(input.current)
        onFocus?.()
      }}
      onBlur={onBlur}
      style={[
        VALUE_TEXT,
        {
          flex: 1,
          minHeight: 44,
          paddingVertical: multiline ? 10 : 0,
          color: colors.foreground,
          // Ô trống: chữ thay thế ("Bắt buộc" / "Tuỳ chọn") dùng font thường như các dòng khác; có chữ mới
          // dùng font mã.
          ...(code && rest.value ? codeStyle('regular') : fontStyle('regular')),
        },
      ]}
    />
  )
}
