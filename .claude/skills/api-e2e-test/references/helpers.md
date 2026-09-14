# Тестовые хелперы

Создаются в задачах API-01 и API-03 и дополняются по мере работы.

## test/helpers.ts

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app'; // тот же, что вызывает main.ts
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser } from './factories';
import { Role } from '../src/generated/prisma/client';

export const ORIGIN = process.env.APP_URL!;

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    // .overrideProvider(MailTransport).useValue(fakeMailTransport)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

// Очищает все таблицы, кроме служебной таблицы миграций.
export async function resetDb(app: INestApplication) {
  const prisma = app.get(PrismaService);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  // Имена таблиц берутся из системного каталога, а не из пользовательского ввода.
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export async function loginAs(app: INestApplication, role: Role = 'STUDENT') {
  const password = 'Passw0rd!';
  const user = await createUser(app, { role, password });
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('Origin', ORIGIN)
    .send({ email: user.email, password })
    .expect(200);
  const cookie = res.headers['set-cookie'];
  return { user, cookie };
}
```

`resetDb` — единственное место, где разрешён `$executeRawUnsafe`, и только в тестах: имена таблиц берутся из `pg_tables`, а не из ввода пользователя.

## test/factories.ts — принципы

- Каждая фабрика принимает `app` и необязательные поля (`Partial<...>`), остальное заполняет разумными значениями.
- Уникальные поля (email, slug) генерируются со счётчиком: `user-${n}@test.local`, `course-${n}`.
- Контент создаётся сразу с опубликованным русским переводом (иначе он не виден в каталоге). Язык и статус можно переопределить параметром.
- `createCourseWithLessons(app, { lessons, access?, price? })` возвращает `{ course, module, lessons, exercises }`: по одному заданию на урок, уроки идут по порядку.
