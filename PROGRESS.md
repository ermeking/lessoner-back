# Прогресс: edu-api

Обновляется после каждой задачи. Источник задач — `docs/ROADMAP-BACKEND.md`.

## Текущая веха
Веха 0. Фундамент

## В работе
—

## Завершено
- **API-01** · 2026-09-15 · Каркас NestJS-бэкенда: конфиг с zod-валидацией, Prisma-клиент через `@prisma/adapter-pg` (без миграции — это API-02), Swagger (`/api/docs`, `/api/docs-json`), `nestjs-pino`, глобальный `ValidationPipe` + `AllExceptionsFilter` → `{code, message, details?}`, `GET /api/v1/health` с реальной проверкой БД, docker-compose (postgres + mailpit), Dockerfile, CI (lint/typecheck/test/build), README. Юнит-тест на `HealthService`, e2e-харнес (`configureApp`, `test/setup.ts`, `health.e2e-spec.ts`). Ветка `task/API-01`, PR не создан — жду отдельного «ок» на пуш.

## Принятые решения
- **API-01: версия Nest.** Последний `@nestjs/cli new` (v12) по умолчанию ставит vitest+oxlint — не подходит, документация требует Jest+ESLint. При этом `@nestjs/core@12` и `@nestjs/config@12` оказались ESM-only и ломают Jest в CommonJS-режиме (`Must use import to load ES Module`). Зафиксировал весь стек на последних CJS-совместимых версиях: `@nestjs/{common,core,platform-express,testing,cli}` `11.2.5`/`11.0.24`, `@nestjs/schematics@11.1.0`, `@nestjs/swagger@^11.4.7`, `@nestjs/config@4.0.4`. `prisma`/`@prisma/client`/`@prisma/adapter-pg` оставлены на `7.10.0` (стабильный Prisma 7, как требует `.claude/rules/prisma.md`) — `prisma@latest`/`typescript@latest` резолвились в нестабильные версии (Prisma 8 RC, TypeScript 7, который несовместим с `typescript-eslint`/`ts-jest`), от них отказался.
- **API-01: относительные импорты с `.js`.** Сгенerированный Prisma-клиент (`prisma-client` generator) использует конвенцию NodeNext — импортирует соседние файлы с расширением `.js`, хотя исходники `.ts`. Под ts-jest в CJS-режиме это не резолвится само. Добавил `moduleNameMapper": {"^(\\.{1,2}/.*)\\.js$": "$1"}` в конфиг Jest (`package.json` и `test/jest-e2e.json`) — стандартное решение для этого паттерна.
- **API-01: Prisma 7 + Jest + WASM query compiler.** Новый движок Prisma 7 грузит WASM-компилятор через динамический `import()`; под Jest это падает с `TypeError: A dynamic import callback was invoked without --experimental-vm-modules`, хотя под обычным Node (`nest start`) работает нормально. Добавил `cross-env` в devDependencies и завёл `test:e2e` как `cross-env NODE_OPTIONS=--experimental-vm-modules jest --config ./test/jest-e2e.json --runInBand` — кросс-платформенно (Windows/*nix). Без этого любой e2e-тест, реально поднимающий `PrismaService`, не запускался бы вообще.
- **API-01: `error-codes.ts`.** Взял полный список кодов из `docs/DOMAIN-SHARED.md` §6 сразу (статичный enum, ничего не подключает заранее), без вспомогательной мапы код→HTTP-статус — `AppException` и так принимает статус явно на каждом месте вызова, как показано в шаблонах скилла `nest-feature`.
- **API-01: зависимости.** `helmet`, `cookie-parser`, `@nestjs/throttler`, `argon2` не добавлены — в API-01 они не используются (нет сессий/кук), появятся в API-03 вместе с `SessionGuard`/`OriginMiddleware`.
- **API-01: docker-compose.** Один Postgres-контейнер с двумя базами: `edu_api` (через `POSTGRES_DB`) и `edu_test` (через `docker/init-test-db.sql`, монтируется в `/docker-entrypoint-initdb.d/`), чтобы `pnpm test:e2e` работал сразу после `docker compose up -d` без ручного создания второй базы.
- **API-01: ревью (`@rev`) нашло и исправлено до PR.**
  1. *Порядок шагов в CI.* `pnpm lint`/`pnpm typecheck` шли раньше `pnpm prisma generate`, а `src/generated/prisma` не коммитится — на чистом чекауте оба шага упали бы (`Cannot find module '../generated/prisma/client.js'`). Локально это не было видно, потому что клиент уже лежал на диске от предыдущих запусков. Переставил `Generate Prisma Client` сразу после `Install dependencies`, до `Lint`/`Typecheck`; проверил симуляцией чистого чекаута (`rm -rf src/generated`) — новый порядок зелёный.
  2. *`test:e2e` смотрел на dev-базу, а не на `edu_test`.* `docker/init-test-db.sql` создавал `edu_test`, но ничто не переключало `DATABASE_URL` для e2e-прогона — тесты подключались бы к `edu_api`. Добавил явные `NODE_ENV=test` и `DATABASE_URL=...edu_test...` в скрипт `test:e2e` через `cross-env` (переменные из `cross-env` идут в `process.env` раньше, чем `dotenv` читает `.env`, а `dotenv` по умолчанию не перезаписывает уже установленные переменные — проверил на заведомо мусорном значении в `.env`, override реально выигрывает).
  3. *`AppException.message` всегда равнялся коду.* `docs/DOMAIN-SHARED.md` §6 говорит, что `message` — для логов и отладки, то есть должен нести что-то помимо кода. Добавил необязательный 4-й параметр `message` (по умолчанию — код, как раньше), не ломая существующие вызовы с 2–3 аргументами.

## Вопросы владельцу
- Ветка `task/API-01` и все изменения — локально, ещё не запушены. Нужно подтверждение перед пушем/созданием PR.

## Замечено по пути
- **Docker недоступен в среде, где я работал.** CLI установлен, но daemon (`desktop-linux` context) не поднят, и обычного способа запустить Docker Desktop из этой сессии нет. Поэтому не проверены руками: `docker compose up -d`, полный успешный `GET /api/v1/health` с живой БД, и `pnpm test:e2e` с реальным подключением.
  Что проверено как компенсация: `pnpm lint/typecheck/test/build` — зелёные; `pnpm start` без Docker поднимается и `/api/v1/health` корректно отдаёт `500 {code: INTERNAL_ERROR}` (без утечки стека) при недоступной БД — то есть проверка БД настоящая, а не заглушка; `/api/docs-json` отдаёт валидный OpenAPI с `operationId: health_check`; без `DATABASE_URL` приложение падает мгновенно с понятным сообщением; `pnpm test:e2e` без БД доходит до реального `ECONNREFUSED`-эквивалента (500), а не до ошибки конфигурации — значит харнес собран верно. Нужно, чтобы кто-то с рабочим Docker прогнал `docker compose up -d && pnpm test:e2e` и подтвердил зелёный прогон и `{status: 'ok', db: 'ok'}` на реальной БД.
