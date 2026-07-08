import { Injectable } from '@nestjs/common';

// Chưa có bảng feature-flag/admin UI trong phạm vi hiện tại — mọi feature mặc định bật.
// Khi cần bật/tắt theo config, thay nội dung `isEnabled` bằng tra cứu DB/cache.
@Injectable()
export class FeatureFlagSystemService {
  isEnabled(_key: string): boolean {
    return true;
  }
}
