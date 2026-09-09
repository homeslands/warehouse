import { Module } from '@nestjs/common';
import { TokenRevocationService } from './token-revocation.service';

/**
 * Tách riêng khỏi `AuthModule` vì `UserModule` cũng cần thu hồi token (đổi mật khẩu hộ user khác)
 * — mà `AuthModule` đã import `UserModule`, nên import ngược lại sẽ thành vòng tròn phải dùng
 * `forwardRef`. Module này không import gì: `RedisModule` và `ConfigModule` đều `@Global()`.
 */
@Module({
  providers: [TokenRevocationService],
  exports: [TokenRevocationService],
})
export class TokenRevocationModule {}
