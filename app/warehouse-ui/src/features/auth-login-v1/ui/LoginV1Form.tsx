import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Form, Input } from 'antd'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loginV1 } from '@/entities/session'
import type { V1LoginBody, V1LoginResult } from '@/shared/api/v1'
import { useAppDispatch } from '@/shared/store'
import { describeLoginV1Error, type LoginV1Failure, type LoginV1Field } from '../model/login-error'

/** `components.schemas.Login.password.maxLength`. Ngoài các ràng buộc OpenAPI không thêm rule FE. */
export const LOGIN_PASSWORD_MAX_LENGTH = 128

/** screen-contracts §Quy tắc chung: vùng chạm trên mobile ≥ 44px. */
const TOUCH_MIN_HEIGHT = 44

export type LoginV1FormProps = {
  /** `name` của antd Form — làm tiền tố id ô (UI-01 và UI-02 không trùng id). */
  formName: string
  initialPhoneNumber?: string
  /** Ô nhận focus khi mở form (UI-02 điền sẵn số điện thoại → focus mật khẩu). */
  autoFocusField?: LoginV1Field
  submitLabel: string
  submittingLabel: string
  onSuccess?: (result: V1LoginResult) => void
}

/** Form đăng nhập v1 dùng chung cho UI-01 và UI-02 (cùng schema nhập `Login`). */
export function LoginV1Form({
  formName,
  initialPhoneNumber = '',
  autoFocusField = 'phoneNumber',
  submitLabel,
  submittingLabel,
  onSuccess,
}: LoginV1FormProps) {
  const { t } = useTranslation(['auth'])
  const [form] = Form.useForm<V1LoginBody>()
  const dispatch = useAppDispatch()
  const [failure, setFailure] = useState<LoginV1Failure['alert']>(null)
  const [showPassword, setShowPassword] = useState(false)
  // Khoá gửi ĐỒNG BỘ: antd validate bất đồng bộ nên hai lần bấm liên tiếp đều tới `onFinish` trước
  // khi `isPending` kịp render lại — chỉ dựa `isPending` là gửi hai request.
  const inFlight = useRef(false)

  const login = useMutation<V1LoginResult, unknown, V1LoginBody>({
    mutationFn: (body) => dispatch(loginV1(body)),
    // Form tự hiện lỗi tại chỗ; toast global nữa là báo một lỗi hai lần.
    meta: { suppressErrorToast: true },
    onSettled: () => {
      inFlight.current = false
    },
    onSuccess: (result) => onSuccess?.(result),
    onError: (error) => {
      const { fieldErrors, alert, clearPassword } = describeLoginV1Error(error)
      form.setFields(fieldErrors.map(({ field, message }) => ({ name: field, errors: [message] })))
      setFailure(alert)
      const first = fieldErrors[0]
      if (first) form.focusField(first.field)
      // Sai thông tin đăng nhập: xoá ô mật khẩu để gõ lại. Lỗi mạng/hệ thống/429 giữ nguyên.
      if (clearPassword) form.setFieldValue('password', '')
    },
  })

  useEffect(() => form.focusField(autoFocusField), [form, autoFocusField])

  return (
    <Form<V1LoginBody>
      form={form}
      name={formName}
      layout="vertical"
      requiredMark={false}
      initialValues={{ phoneNumber: initialPhoneNumber, password: '' }}
      // Lỗi đang hiện nói về lần gửi trước; người dùng sửa input là đã trả lời nó.
      onValuesChange={() => setFailure(null)}
      onFinish={(values) => {
        // Chống gửi lặp (double click / Enter liên tiếp) khi request trước chưa xong.
        if (inFlight.current) return
        inFlight.current = true
        setFailure(null)
        login.mutate(values)
      }}
      onFinishFailed={({ errorFields }) => {
        const first = errorFields[0]
        if (first) form.focusField(first.name)
      }}
    >
      <Form.Item<V1LoginBody>
        label={t('auth:v1.phoneNumber')}
        name="phoneNumber"
        rules={[{ required: true, message: t('auth:v1.phoneNumberRequired') }]}
      >
        {/* Không ép định dạng/`inputMode="tel"`: `Login.phoneNumber` chỉ có minLength 1. */}
        <Input autoComplete="username" style={{ minHeight: TOUCH_MIN_HEIGHT }} />
      </Form.Item>

      <Form.Item<V1LoginBody>
        label={t('auth:password')}
        name="password"
        rules={[
          { required: true, message: t('auth:v1.passwordRequired') },
          {
            max: LOGIN_PASSWORD_MAX_LENGTH,
            message: t('auth:v1.passwordTooLong', { max: LOGIN_PASSWORD_MAX_LENGTH }),
          },
        ]}
      >
        <Input
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          style={{ minHeight: TOUCH_MIN_HEIGHT }}
          suffix={
            // Nút thật (focus được bằng Tab) thay cho icon mặc định của Input.Password.
            <Button
              type="text"
              size="small"
              aria-label={showPassword ? t('auth:hidePassword') : t('auth:showPassword')}
              aria-pressed={showPassword}
              icon={
                showPassword ? (
                  <EyeOffIcon size={16} aria-hidden="true" />
                ) : (
                  <EyeIcon size={16} aria-hidden="true" />
                )
              }
              onClick={() => setShowPassword((shown) => !shown)}
            />
          }
        />
      </Form.Item>

      {failure && (
        <Alert
          type="error"
          role="alert"
          showIcon
          style={{ marginBottom: 16 }}
          title={failure.message}
          description={
            failure.traceId ? t('auth:v1.traceId', { traceId: failure.traceId }) : undefined
          }
        />
      )}

      <Button
        type="primary"
        htmlType="submit"
        block
        loading={login.isPending}
        style={{ minHeight: TOUCH_MIN_HEIGHT }}
      >
        {login.isPending ? submittingLabel : submitLabel}
      </Button>
    </Form>
  )
}
