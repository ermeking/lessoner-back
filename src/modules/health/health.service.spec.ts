import { PrismaService } from '../../prisma/prisma.service';
import { HealthService } from './health.service';

function createPrismaMock(queryRaw: jest.Mock): PrismaService {
  return { $queryRaw: queryRaw } as unknown as PrismaService;
}

describe('HealthService', () => {
  it('возвращает ok, если запрос к БД прошёл успешно', async () => {
    const prisma = createPrismaMock(jest.fn().mockResolvedValue([{ 1: 1 }]));
    const service = new HealthService(prisma);

    await expect(service.check()).resolves.toEqual({ status: 'ok', db: 'ok' });
  });

  it('пробрасывает ошибку, если БД недоступна', async () => {
    const prisma = createPrismaMock(
      jest.fn().mockRejectedValue(new Error('connection refused')),
    );
    const service = new HealthService(prisma);

    await expect(service.check()).rejects.toThrow('connection refused');
  });
});
