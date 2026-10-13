import { DataSource } from 'typeorm';
import { TransactionManagerService } from './transaction-manager.service';

describe('TransactionManagerService', () => {
  const queryRunner = {
    manager: { save: jest.fn() },
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };
  const dataSource = { createQueryRunner: () => queryRunner } as unknown as DataSource;
  let service: TransactionManagerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TransactionManagerService(dataSource);
  });

  it('commits and returns the result when every write succeeds', async () => {
    const onSuccess = jest.fn();

    await expect(service.execute(async () => 'ok', onSuccess)).resolves.toBe('ok');

    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith('ok');
    expect(queryRunner.release).toHaveBeenCalled();
  });

  // Vd tạo phiếu nhập: đầu phiếu đã ghi, ghi dòng vật tư lỗi ⇒ phải rollback cả đầu phiếu.
  it('rolls back, rethrows and releases when a later write fails', async () => {
    const onFailure = jest.fn();
    const error = new Error('ER_DUP_ENTRY');

    await expect(
      service.execute(
        async (manager) => {
          await manager.save({});
          throw error;
        },
        undefined,
        onFailure,
      ),
    ).rejects.toBe(error);

    expect(queryRunner.manager.save).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(error);
    expect(queryRunner.release).toHaveBeenCalled();
  });
});
