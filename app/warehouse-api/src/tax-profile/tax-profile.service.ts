import { Inject, Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  GetAllTaxProfileRequestDto,
  TaxProfileResponseDto,
  VietQrBusinessData,
  VietQrBusinessResponse,
} from './tax-profile.dto';
import { TaxProfile } from './tax-profile.entity';
import { TaxProfileException } from './tax-profile.exception';
import { TaxProfileValidation } from './tax-profile.validation';
import {
  TAX_PROFILE_BRANCH_SUFFIX_REGEX,
  VIETQR_BUSINESS_API_URL,
  VIETQR_CODE_SUCCESS,
  VIETQR_CODE_TAX_INVALID,
  VIETQR_CODE_TAX_NOT_FOUND,
  VIETQR_TIMEOUT_MS,
} from './tax-profile.constants';
import { AppPaginatedResponseDto } from 'src/app/app.dto';

@Injectable()
export class TaxProfileService {
  constructor(
    @InjectRepository(TaxProfile) private readonly taxProfileRepository: Repository<TaxProfile>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async findAll(
    query: GetAllTaxProfileRequestDto,
  ): Promise<AppPaginatedResponseDto<TaxProfileResponseDto>> {
    const [items, total] = await this.taxProfileRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, TaxProfile, TaxProfileResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<TaxProfileResponseDto>;
  }

  /**
   * Cache-first: đã có bản ghi thì trả luôn, KHÔNG gọi upstream. Dữ liệu upstream tự khai là cũ 7
   * ngày tới 1 tháng nên TTL ngắn không mua được gì ngoài độ trễ và thêm một điểm chết.
   */
  async lookup(taxCode: string): Promise<TaxProfileResponseDto> {
    const normalized = this.normalizeTaxCode(taxCode);

    const cached = await this.taxProfileRepository.findOneBy({ taxCode: normalized });
    if (cached) return this.mapper.map(cached, TaxProfile, TaxProfileResponseDto);

    return this.fetchAndUpsert(normalized);
  }

  /** Luôn gọi upstream và ghi đè cache — endpoint riêng, giới hạn ADMIN ở decorator. */
  async refresh(taxCode: string): Promise<TaxProfileResponseDto> {
    return this.fetchAndUpsert(this.normalizeTaxCode(taxCode));
  }

  private normalizeTaxCode(taxCode: string): string {
    const normalized = taxCode?.trim();
    if (!normalized)
      throw new TaxProfileException(TaxProfileValidation.TAX_PROFILE_TAX_CODE_IS_REQUIRED);
    // Chặn TRƯỚC khi gọi upstream: upstream trả `code: 51` ("không tồn tại") cho mọi mã chi nhánh,
    // thông báo đó sai nguyên nhân và tốn 1 round-trip vô nghĩa.
    if (TAX_PROFILE_BRANCH_SUFFIX_REGEX.test(normalized))
      throw new TaxProfileException(TaxProfileValidation.TAX_PROFILE_BRANCH_CODE_NOT_SUPPORTED);
    return normalized;
  }

  private async fetchAndUpsert(taxCode: string): Promise<TaxProfileResponseDto> {
    const context = `${TaxProfileService.name}.${this.fetchAndUpsert.name}`;
    // `fetchFromUpstream` ném TRƯỚC khi chạm DB — upstream chết không được phép phá cache đang có.
    const body = await this.fetchFromUpstream(taxCode);
    const saved = await this.upsert(taxCode, body);
    this.logger.log(`Tax profile synced: ${taxCode}`, context);
    return this.mapper.map(saved, TaxProfile, TaxProfileResponseDto);
  }

  /**
   * ⚠️ Upstream LUÔN trả HTTP 200, kể cả khi lỗi — trạng thái thật nằm ở field `code` trong body.
   * Đừng thay bằng check `response.status`, mọi lỗi sẽ lọt thành "thành công với data rỗng".
   */
  private async fetchFromUpstream(taxCode: string): Promise<VietQrBusinessResponse> {
    const context = `${TaxProfileService.name}.${this.fetchFromUpstream.name}`;
    const baseUrl =
      this.configService.get<string>('VIETQR_BUSINESS_API_URL') ?? VIETQR_BUSINESS_API_URL;

    let body: VietQrBusinessResponse;
    try {
      const response = await firstValueFrom(
        this.httpService.get<VietQrBusinessResponse>(`${baseUrl}/${encodeURIComponent(taxCode)}`, {
          timeout: VIETQR_TIMEOUT_MS,
        }),
      );
      body = response.data;
    } catch (error) {
      // Mạng lỗi / timeout / DNS / 5xx: không phân biệt, đều là "bên thứ ba không dùng được".
      this.logger.error(`Tax lookup request failed for ${taxCode}: ${error}`, context);
      throw new TaxProfileException(TaxProfileValidation.TAX_PROFILE_LOOKUP_FAILED);
    }

    if (body?.code === VIETQR_CODE_TAX_NOT_FOUND)
      throw new TaxProfileException(TaxProfileValidation.TAX_PROFILE_NOT_FOUND_UPSTREAM);
    if (body?.code === VIETQR_CODE_TAX_INVALID)
      throw new TaxProfileException(TaxProfileValidation.TAX_PROFILE_REJECTED_UPSTREAM);
    // `code` lạ, hoặc `code: '00'` mà `data` rỗng: coi như bên thứ ba hỏng, không ghi bản ghi rác.
    if (body?.code !== VIETQR_CODE_SUCCESS || !body?.data) {
      this.logger.error(`Unexpected tax lookup payload for ${taxCode}: ${body?.code}`, context);
      throw new TaxProfileException(TaxProfileValidation.TAX_PROFILE_LOOKUP_FAILED);
    }

    return body;
  }

  /** Upsert theo `taxCode` — không bao giờ tạo bản ghi thứ 2 cho cùng 1 mã số thuế. */
  private async upsert(taxCode: string, body: VietQrBusinessResponse): Promise<TaxProfile> {
    const data = body.data as VietQrBusinessData;
    const fields = {
      // Lưu theo giá trị TA HỎI, không theo `data.id` upstream trả về: upstream chuẩn hoá khác đi
      // thì khoá cache lệch, lần lookup sau lại miss và gọi lại upstream mãi.
      taxCode,
      name: data.name,
      internationalName: data.internationalName ?? null,
      shortName: data.shortName ?? null,
      address: data.address ?? null,
      status: data.status ?? null,
      sourceUpdatedAt: this.parseSourceUpdatedAt(body.metadata?.updatedAt),
    };

    const existed = await this.taxProfileRepository.findOneBy({ taxCode });
    const entity = existed
      ? Object.assign(existed, fields)
      : this.taxProfileRepository.create(fields);

    return this.taxProfileRepository.save(entity);
  }

  private parseSourceUpdatedAt(raw?: string): Date | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
