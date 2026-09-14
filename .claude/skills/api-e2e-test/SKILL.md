---
name: api-e2e-test
description: "Написание e2e-тестов для edu-api на Jest + supertest с реальным PostgreSQL — фабрики, вход под нужной ролью, проверка кодов ошибок и правил доступа. Используй этот скилл всякий раз, когда нужно покрыть тестами эндпоинт, проверить права ролей или сценарий прогресса, или когда падает существующий e2e-тест."
---

# e2e-тесты edu-api

e2e-тесты — главная защита правил из `docs/DOMAIN-SHARED.md`: они проверяют, что эндпоинт ведёт себя правильно для гостя, ученика и администратора на настоящей БД. Хелперы и принципы фабрик лежат в `references/helpers.md`.

## Что покрывать для каждого эндпоинта

1. **Успешный сценарий:** статус и форма ответа (ключевые поля).
2. **Доступ:** гость (401 `UNAUTHORIZED`, если нужен вход), неподходящая роль (403 `FORBIDDEN`).
3. **Основные ошибки** из `@ApiErrors` эндпоинта: проверяются статус и `body.code`.
4. **Изоляция данных:** пользователь A не видит и не меняет данные пользователя B.
5. **Для учёбы:** правила порядка и доступа из `DOMAIN.md`, раздел 5, на реальных данных.

## Правила

- **Приложение** создаётся через `createTestApp()`, который вызывает тот же `configureApp()`, что и `main.ts`. Иначе тест проверяет не то приложение, что работает в продакшне.
- **Изменяющие запросы** отправляются с заголовком `Origin: process.env.APP_URL`; иначе получишь `ORIGIN_FORBIDDEN`.
- **Данные** создаются фабриками внутри теста. На сид не опирайся: тест должен быть понятен без чтения `seed.ts`.
- **Перед каждым тестом** БД очищается через `resetDb()`.
- **Проверяй `code`, а не `message`:** текст сообщения может меняться, код — это контракт.
- **Внешние сервисы:** письма перехватываются фейковым транспортом (письмо можно достать из него и взять токен), Google мокается.
- **Имена тестов** на русском и описывают поведение: `'ученик не может сдать задание урока, если предыдущий не завершён'`.

## Шаблон файла

```ts
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb, loginAs, ORIGIN } from './helpers';
import { createCourseWithLessons } from './factories';

describe('learning: сдачи (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(); });
  beforeEach(async () => { await resetDb(app); });
  afterAll(async () => { await app.close(); });

  it('гость не может отправить сдачу', async () => {
    const { exercises } = await createCourseWithLessons(app, { lessons: 1 });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/learning/exercises/${exercises[0].id}/submissions`)
      .set('Origin', ORIGIN)
      .send({ code: 'x', passed: true, testsPassed: 1, testsTotal: 1 });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('сдача второго урока до завершения первого отклоняется', async () => {
    const { cookie } = await loginAs(app, 'STUDENT');
    const { exercises } = await createCourseWithLessons(app, { lessons: 2 });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/learning/exercises/${exercises[1].id}/submissions`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ code: 'x', passed: true, testsPassed: 1, testsTotal: 1 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('LESSON_LOCKED');
  });
});
```

## Если тест падает

Сначала реши, кто прав: тест или код. Источник истины — `docs/DOMAIN-SHARED.md`. Не меняй ожидание в тесте, чтобы он «позеленел», если это противоречит документу.
