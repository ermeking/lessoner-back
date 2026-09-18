# edu-api

Бэкенд образовательной платформы по программированию: NestJS + Prisma 7 + PostgreSQL.

Документация — `CLAUDE.md` и `docs/`. Роадмап — `docs/ROADMAP-BACKEND.md`.

## Запуск

```bash
pnpm install
cp .env.example .env             # заполнить при необходимости
docker compose up -d             # postgres (базы edu_api и edu_test) + mailpit (http://localhost:8025)
pnpm prisma migrate dev          # применить миграции к edu_api
pnpm prisma db seed              # администратор из env + демо-курсы (frontend, demo-js, demo-paid)
pnpm dev                         # API: http://localhost:3000/api/v1, Swagger UI: /api/docs, JSON: /api/docs-json
```

Проверка, что всё поднялось:

```bash
curl http://localhost:3000/api/v1/health
# { "status": "ok", "db": "ok" }
```

## Проверки

```bash
pnpm lint
pnpm typecheck
pnpm test           # юнит-тесты
pnpm test:e2e       # e2e (реальный PostgreSQL, база edu_test)
pnpm build
```

## Переменные окружения

Описаны и валидируются в `src/config/env.schema.ts`, пример значений — `.env.example`. При отсутствии обязательной переменной приложение не запускается и печатает, какой переменной не хватает.
