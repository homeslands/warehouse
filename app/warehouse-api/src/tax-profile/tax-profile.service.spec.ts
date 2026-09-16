import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { of, throwError } from 'rxjs';
import { TaxProfileService } from './tax-profile.service';
import { TaxProfileProfile } from './tax-profile.mapper';
import { TaxProfile } from './tax-profile.entity';
import { TaxProfileException } from './tax-profile.exception';
import { TaxProfileValidation } from './tax-profile.validation';

const TAX_CODE = '0101245486';

const cachedProfile = (overrides: Partial<TaxProfile> = {}): TaxProfile =>
  ({
    id: 'tax-profile-id-1',
    slug: 'tp-slug-1',
    taxCode: TAX_CODE,
    name: 'TẬP ĐOÀN VINGROUP - CÔNG TY CP',
    internationalName: 'VINGROUP JOINT STOCK COMPANY',
    shortName: 'VINGROUP',
    address: 'Số 7, Đường Bằng Lăng 1, TP Hà Nội',
    status: 'NNT đang hoạt động',
    ...overrides,
  }) as TaxProfile;

/** Body thật của upstream (đã kiểm chứng bằng request thật), luôn kèm HTTP 200. */
const upstreamOk = (data: Record<string, unknown> = {}) => ({
  status: 200,
  data: {
    code: '00',
    desc: 'Success - Thành công',
    data: {
      id: TAX_CODE,
      name: 'TẬP ĐOÀN VINGROUP - CÔNG TY CP',
      internationalName: 'VINGROUP JOINT STOCK COMPANY',
      shortName: 'VINGROUP',
      address: 'Số 7, Đường Bằng Lăng 1, TP Hà Nội',
      status: 'NNT đang hoạt động',
      ...data,
    },
    metadata: { source: 'https://www.gdt.gov.vn', updatedAt: '2026-08-17T09:27:43.000Z' },
  },
});

const upstreamError = (code: string) => ({
  status: 200,
  data: { code, desc: 'error', data: null },
});

const expectTaxProfileError = async (promise: Promise<unknown>, code: number) => {
  await expect(promise).rejects.toBeInstanceOf(TaxProfileException);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('TaxProfileService', () => {
  let service: TaxProfileService;
  const taxProfileRepository = {
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
  };
  const httpService = { get: jest.fn() };
  const configService = { get: jest.fn().mockReturnValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    taxProfileRepository.create.mockImplementation((data) => data);
    taxProfileRepository.save.mockImplementation((data) => ({ ...data, id: 'tax-profile-id-1' }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxProfileService,
        TaxProfileProfile,
        { provide: getRepositoryToken(TaxProfile), useValue: taxProfileRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn(), error: jest.fn() } },
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    await module.init();

    service = module.get<TaxProfileService>(TaxProfileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('lookup - cache behaviour', () => {
    it('returns the cached row without calling the provider', async () => {
      taxProfileRepository.findOneBy.mockResolvedValue(cachedProfile());

      const result = await service.lookup(TAX_CODE);

      expect(httpService.get).not.toHaveBeenCalled();
      expect(taxProfileRepository.save).not.toHaveBeenCalled();
      expect(result).toMatchObject({ taxCode: TAX_CODE, shortName: 'VINGROUP' });
    });

    it('calls the provider and caches the result on a miss', async () => {
      taxProfileRepository.findOneBy.mockResolvedValue(null);
      httpService.get.mockReturnValue(of(upstreamOk()));

      const result = await service.lookup(TAX_CODE);

      expect(httpService.get).toHaveBeenCalledTimes(1);
      expect(taxProfileRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ taxCode: TAX_CODE, name: 'TẬP ĐOÀN VINGROUP - CÔNG TY CP' }),
      );
      expect(result).toMatchObject({ taxCode: TAX_CODE });
    });

    it('stores the tax code we asked for, not the id the provider echoed back', async () => {
      taxProfileRepository.findOneBy.mockResolvedValue(null);
      httpService.get.mockReturnValue(of(upstreamOk({ id: 'SOMETHING-ELSE' })));

      await service.lookup(TAX_CODE);

      expect(taxProfileRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ taxCode: TAX_CODE }),
      );
    });

    it('persists the provider-side data timestamp as sourceUpdatedAt', async () => {
      taxProfileRepository.findOneBy.mockResolvedValue(null);
      httpService.get.mockReturnValue(of(upstreamOk()));

      await service.lookup(TAX_CODE);

      expect(taxProfileRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ sourceUpdatedAt: new Date('2026-08-17T09:27:43.000Z') }),
      );
    });

    it('keeps null for the fields the provider commonly omits', async () => {
      taxProfileRepository.findOneBy.mockResolvedValue(null);
      httpService.get.mockReturnValue(of(upstreamOk({ internationalName: null, shortName: null })));

      await service.lookup(TAX_CODE);

      expect(taxProfileRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ internationalName: null, shortName: null }),
      );
    });
  });

  // Bất biến quan trọng nhất của module: upstream trả HTTP 200 cho MỌI trường hợp, kể cả lỗi.
  // Nếu ai đó đổi sang check `response.status`, mọi lỗi sẽ lọt thành "thành công với data rỗng".
  describe('lookup - provider errors arrive as HTTP 200', () => {
    beforeEach(() => taxProfileRepository.findOneBy.mockResolvedValue(null));

    it('maps code 51 to a 404 not-found-upstream error', async () => {
      httpService.get.mockReturnValue(of(upstreamError('51')));

      await expectTaxProfileError(
        service.lookup(TAX_CODE),
        TaxProfileValidation.TAX_PROFILE_NOT_FOUND_UPSTREAM.code,
      );
      expect(TaxProfileValidation.TAX_PROFILE_NOT_FOUND_UPSTREAM.statusCode).toBe(404);
    });

    it('maps code 52 to a 400 rejected-upstream error', async () => {
      httpService.get.mockReturnValue(of(upstreamError('52')));

      await expectTaxProfileError(
        service.lookup(TAX_CODE),
        TaxProfileValidation.TAX_PROFILE_REJECTED_UPSTREAM.code,
      );
    });

    it('maps an unknown code to a 502 lookup-failed error', async () => {
      httpService.get.mockReturnValue(of(upstreamError('99')));

      await expectTaxProfileError(
        service.lookup(TAX_CODE),
        TaxProfileValidation.TAX_PROFILE_LOOKUP_FAILED.code,
      );
      expect(TaxProfileValidation.TAX_PROFILE_LOOKUP_FAILED.statusCode).toBe(502);
    });

    it('treats a success code with an empty data object as a provider failure', async () => {
      httpService.get.mockReturnValue(of({ status: 200, data: { code: '00', data: null } }));

      await expectTaxProfileError(
        service.lookup(TAX_CODE),
        TaxProfileValidation.TAX_PROFILE_LOOKUP_FAILED.code,
      );
    });

    it('maps a network/timeout failure to lookup-failed', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('ETIMEDOUT')));

      await expectTaxProfileError(
        service.lookup(TAX_CODE),
        TaxProfileValidation.TAX_PROFILE_LOOKUP_FAILED.code,
      );
    });

    it('never writes to the DB when the provider fails', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('ETIMEDOUT')));

      await expect(service.lookup(TAX_CODE)).rejects.toBeInstanceOf(TaxProfileException);
      expect(taxProfileRepository.save).not.toHaveBeenCalled();
      expect(taxProfileRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('branch tax codes', () => {
    it('rejects a branch code before making any request', async () => {
      await expectTaxProfileError(
        service.lookup('0101245486-001'),
        TaxProfileValidation.TAX_PROFILE_BRANCH_CODE_NOT_SUPPORTED.code,
      );
      expect(httpService.get).not.toHaveBeenCalled();
      expect(taxProfileRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('rejects a branch code on refresh too', async () => {
      await expectTaxProfileError(
        service.refresh('0101245486-001'),
        TaxProfileValidation.TAX_PROFILE_BRANCH_CODE_NOT_SUPPORTED.code,
      );
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('rejects a blank tax code', async () => {
      await expectTaxProfileError(
        service.lookup('   '),
        TaxProfileValidation.TAX_PROFILE_TAX_CODE_IS_REQUIRED.code,
      );
    });
  });

  describe('refresh', () => {
    it('calls the provider even when a cached row exists', async () => {
      taxProfileRepository.findOneBy.mockResolvedValue(cachedProfile({ name: 'TÊN CŨ' }));
      httpService.get.mockReturnValue(of(upstreamOk()));

      const result = await service.refresh(TAX_CODE);

      expect(httpService.get).toHaveBeenCalledTimes(1);
      expect(result.name).toBe('TẬP ĐOÀN VINGROUP - CÔNG TY CP');
    });

    it('updates the existing row in place instead of inserting a second one', async () => {
      const existing = cachedProfile({ name: 'TÊN CŨ' });
      taxProfileRepository.findOneBy.mockResolvedValue(existing);
      httpService.get.mockReturnValue(of(upstreamOk()));

      await service.refresh(TAX_CODE);

      expect(taxProfileRepository.create).not.toHaveBeenCalled();
      expect(taxProfileRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tax-profile-id-1', slug: 'tp-slug-1' }),
      );
    });

    it('trims the tax code before using it', async () => {
      taxProfileRepository.findOneBy.mockResolvedValue(null);
      httpService.get.mockReturnValue(of(upstreamOk()));

      await service.refresh(`  ${TAX_CODE}  `);

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining(TAX_CODE),
        expect.anything(),
      );
    });
  });

  describe('findAll', () => {
    it('computes pagination metadata', async () => {
      taxProfileRepository.findAndCount.mockResolvedValue([[cachedProfile()], 3]);

      const result = await service.findAll({ page: 2, size: 1 });

      expect(result).toMatchObject({
        total: 3,
        page: 2,
        pageSize: 1,
        totalPages: 3,
        hasNext: true,
        hasPrevios: true,
      });
      expect(result.items[0]).toMatchObject({ taxCode: TAX_CODE, slug: 'tp-slug-1' });
    });
  });
});
