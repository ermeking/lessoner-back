# Архитектура бэкенда (`edu-api`)

> Бизнес-правила (доступ, прогресс, роли, коды ошибок) описаны в `docs/DOMAIN-SHARED.md`: этот документ на них опирается и их не повторяет.
> Формат контента для импорта — `docs/CONTENT-FORMAT-SHARED.md`. План работ — `docs/ROADMAP-BACKEND.md`.

---

## 1. Назначение и границы

`edu-api` — единственный владелец данных и бизнес-логики. Он хранит пользователей, контент, переводы, прогресс и доступы, проверяет все правила доступа, отдаёт REST API для `edu-web`, отправляет письма и импортирует контент из `edu-content`.

Чего `edu-api` не делает: не рендерит HTML, не выполняет код учеников (это делает браузер) и в v1 не принимает загрузку файлов через API. Картинки уроков попадают на сервер только через CLI-импорт.

## 2. Стек

| Назначение | Библиотеки |
|---|---|
| Фреймворк | NestJS (`@nestjs/core`, `@nestjs/platform-express`) |
| Конфигурация | `@nestjs/config` + zod (схема env) |
| БД и ORM | PostgreSQL, Prisma 7 (`prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`) |
| Валидация | `class-validator`, `class-transformer` |
| OpenAPI | `@nestjs/swagger` с CLI-плагином |
| Безопасность | `helmet`, `cookie-parser`, `@nestjs/throttler`, `argon2` |
| Логи | `nestjs-pino` (`pino-pretty` только в dev) |
| Письма | `nodemailer` |
| OAuth | `openid-client` |
| CLI | `nest-commander` |
| Импорт контента | `zod`, `yaml`, `gray-matter` |
| Тесты | Jest + `supertest` (стандарт NestJS) |

Версии — последние стабильные на момент старта; зафиксированы в `package.json` и `pnpm-lock.yaml`.

## 3. Структура папок

```
edu-api/
├─ src/
│  ├─ main.ts                    bootstrap: helmet, cookie-parser, префикс /api, версия v1, Swagger
│  ├─ app.module.ts
│  ├─ config/                    env.schema.ts (zod), config.module.ts
│  ├─ prisma/                    prisma.service.ts, prisma.module.ts
│  ├─ generated/prisma/          сгенерированный Prisma Client — не редактировать
│  ├─ common/
│  │  ├─ error-codes.ts          коды из DOMAIN.md, раздел 6
│  │  ├─ app-exception.ts        AppException(code, status, details?)
│  │  ├─ filters/                AllExceptionsFilter → { code, message, details? }
│  │  ├─ guards/                 SessionGuard, RolesGuard
│  │  ├─ middleware/             OriginMiddleware
│  │  ├─ decorators/             @Public, @OptionalAuth, @Roles, @CurrentUser, @ApiErrors
│  │  ├─ translations.ts         pickTranslation — выбор перевода с откатом на ru
│  │  └─ pagination.ts           PageQueryDto, PageResponse<T>
│  ├─ modules/
│  │  ├─ health/
│  │  ├─ auth/                   регистрация, вход, сессии, письма-токены, Google
│  │  ├─ users/                  профиль и пароль
│  │  ├─ mail/                   отправка и шаблоны писем (ru/ky/en)
│  │  ├─ access/                 AccessService + чистые функции правил
│  │  ├─ catalog/                публичное чтение
│  │  ├─ learning/               сдачи, прогресс, подсказки, эталоны, дашборд
│  │  ├─ reports/                обращения учеников
│  │  ├─ admin-content/          CRUD контента, переводы, статусы, порядок
│  │  ├─ admin-users/            пользователи, блокировка, ручная выдача доступа
│  │  └─ stats/                  статистика застреваний и обзор
│  └─ cli/
│     └─ content-import/         команда импорта
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ prisma.config.ts
├─ test/                         e2e: *.e2e-spec.ts, factories.ts, helpers.ts
├─ deploy/                       docker-compose.prod.yml, Caddyfile, backup.sh, README.md
├─ docs/                         DOMAIN.md, ARCHITECTURE.md, ROADMAP.md, CONTENT_FORMAT.md
└─ .claude/                      rules/ и skills/ для агентов
```

Каждый модуль устроен одинаково: `<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`, `dto/`, `<name>.service.spec.ts`. Модуль `admin-content` для удобства может быть разбит на несколько контроллеров (по сущностям).

## 4. Жизненный цикл запроса

```
запрос
 → pino-http          логирование с requestId; cookie и пароли скрыты
 → helmet, cookie-parser
 → OriginMiddleware   для POST/PUT/PATCH/DELETE: Origin должен совпадать с APP_URL, иначе 403 ORIGIN_FORBIDDEN
 → ThrottlerGuard     лимиты запросов (строже на /auth/* и сдачах)
 → SessionGuard       кука sid → сессия → пользователь
                      @Public — пускает всех; @OptionalAuth — пользователь или null; по умолчанию нужен вход
 → RolesGuard         @Roles('REVIEWER', 'ADMIN')
 → ValidationPipe     whitelist + forbidNonWhitelisted; ошибки → VALIDATION_ERROR с details
 → Controller         только HTTP: параметры, вызов сервиса, маппинг в DTO ответа
 → Service            бизнес-логика; все проверки доступа — через AccessService
 → Prisma
ошибка на любом шаге → AllExceptionsFilter → { code, message, details? }
```

Контроллер не содержит бизнес-логики и не обращается к Prisma напрямую. Сервис никогда не возвращает контроллеру объект, который уйдёт наружу как есть: ответ всегда собирается функцией маппинга в DTO.

## 5. Модули и их зависимости

```
auth ──────▶ mail, users
catalog ───▶ access
learning ──▶ access
admin-users, admin-content, reports, stats ──▶ только prisma и common
cli/content-import ──▶ только prisma и common (запускается отдельным процессом)
```

`access` вынесен в отдельный модуль, чтобы `catalog` и `learning` не зависели друг от друга. Внутри он разделён на две части:

- **чистые функции** в `access.rules.ts`: на вход — уже загруженные данные (порядок уроков, завершённые уроки, есть ли доступ, бесплатный ли курс), на выход — состояния и решения. Никакого Prisma, поэтому их легко проверять табличными юнит-тестами по `DOMAIN.md`;
- **`AccessService`**: загружает данные через Prisma и вызывает чистые функции.

## 6. Каталог эндпоинтов v1

Все пути начинаются с `/api/v1`. У каждого эндпоинта `operationId` вида `<модуль>_<действие>`: из него Kubb генерирует имена функций и хуков во фронтенде, поэтому менять `operationId` без согласования нельзя.

**Доступ:** «публичный» — `@Public`; «опц.» — `@OptionalAuth` (работает и для гостя, но учитывает пользователя); «вход» — нужна сессия; роли указаны явно.

### Служебное и аутентификация

| Метод и путь | Доступ | operationId |
|---|---|---|
| `GET /health` | публичный | `health_check` |
| `POST /auth/register` | публичный | `auth_register` |
| `POST /auth/login` | публичный | `auth_login` |
| `POST /auth/logout` | вход | `auth_logout` |
| `POST /auth/logout-all` | вход | `auth_logoutAll` |
| `GET /auth/me` | вход | `auth_me` |
| `POST /auth/verify-email/send` | вход | `auth_sendVerifyEmail` |
| `POST /auth/verify-email` | публичный | `auth_verifyEmail` |
| `POST /auth/password/forgot` | публичный | `auth_forgotPassword` |
| `POST /auth/password/reset` | публичный | `auth_resetPassword` |
| `GET /auth/google` | публичный | `auth_googleStart` (редирект) |
| `GET /auth/google/callback` | публичный | `auth_googleCallback` (редирект) |
| `PATCH /users/me` | вход | `users_updateMe` |
| `POST /users/me/password` | вход | `users_changePassword` |

### Каталог и учёба

| Метод и путь | Доступ | operationId |
|---|---|---|
| `GET /catalog/tracks` | опц. | `catalog_listTracks` |
| `GET /catalog/tracks/:slug` | опц. | `catalog_getTrack` |
| `GET /catalog/courses/:slug` | опц. | `catalog_getCourse` |
| `GET /catalog/courses/:courseSlug/lessons/:lessonSlug` | опц. | `catalog_getLesson` |
| `GET /catalog/sitemap` | публичный | `catalog_getSitemap` |
| `POST /learning/exercises/:id/submissions` | вход | `learning_submit` |
| `POST /learning/lessons/:id/complete` | вход | `learning_completeLesson` |
| `POST /learning/exercises/:id/hints` | вход | `learning_openHint` |
| `GET /learning/exercises/:id/solution` | вход | `learning_getSolution` |
| `GET /learning/lessons/:id/state` | вход | `learning_getLessonState` |
| `GET /learning/dashboard` | вход | `learning_getDashboard` |
| `POST /reports` | вход | `reports_create` |

Все эндпоинты каталога принимают `?locale=ru|ky|en`.

### Админка

`<entity>` — одно из `tracks`, `courses`, `modules`, `lessons`, `exercises`.

| Метод и путь | Доступ | operationId |
|---|---|---|
| `GET /admin/content/tree` | REVIEWER, ADMIN | `adminContent_getTree` |
| `GET, POST /admin/<entity>` | REVIEWER, ADMIN | `adminContent_list<Entity>`, `adminContent_create<Entity>` |
| `GET, PATCH, DELETE /admin/<entity>/:id` | REVIEWER, ADMIN | `adminContent_get<Entity>`, `…_update<Entity>`, `…_delete<Entity>` |
| `PUT /admin/tracks/:id/courses` | REVIEWER, ADMIN | `adminContent_setTrackCourses` (состав и порядок) |
| `PUT /admin/<parent>/:id/order` | REVIEWER, ADMIN | `adminContent_reorder` (`{ ids: [] }`) |
| `GET, PUT /admin/<entity>/:id/translations/:locale` | REVIEWER, ADMIN | `adminContent_getTranslation`, `adminContent_upsertTranslation` |
| `PATCH /admin/<entity>/:id/translations/:locale/status` | REVIEWER, ADMIN | `adminContent_setTranslationStatus` |
| `GET /admin/reports` | REVIEWER, ADMIN | `adminReports_list` |
| `PATCH /admin/reports/:id` | REVIEWER, ADMIN | `adminReports_update` |
| `GET /admin/stats/exercises` | REVIEWER, ADMIN | `adminStats_exercises` |
| `GET /admin/stats/overview` | REVIEWER, ADMIN | `adminStats_overview` |
| `GET /admin/users` | ADMIN | `adminUsers_list` |
| `GET /admin/users/:id` | ADMIN | `adminUsers_get` |
| `POST /admin/users/:id/block`, `/unblock` | ADMIN | `adminUsers_block`, `adminUsers_unblock` |
| `POST /admin/users/:id/grants` | ADMIN | `adminUsers_grantCourse` |
| `DELETE /admin/users/:id/grants/:grantId` | ADMIN | `adminUsers_revokeGrant` |

Когда задача добавляет или меняет эндпоинт, эта таблица обновляется в том же PR.

## 7. Аутентификация и сессии

- **Пароли.** argon2id, минимальная длина 8 символов. Email приводится к нижнему регистру при записи и поиске.
- **Сессия.** Случайный токен (32 байта, base64url) хранится в куке `sid`: httpOnly, Secure (в dev — без Secure), SameSite=Lax, срок 30 дней. В таблице `Session` лежит только SHA-256 хеш. Если с `lastUsedAt` прошло больше суток, срок продлевается.
- **Выход.** `logout` удаляет текущую сессию, `logout-all` — все. Смена или сброс пароля удаляет остальные сессии, блокировка — все.
- **Письма-токены.** `UserToken`: хеш токена, одноразовый; подтверждение email действует 24 часа, сброс пароля — 1 час. `password/forgot` всегда отвечает 204.
- **Google.** Authorization code flow через `openid-client`, `state` лежит в куке на 10 минут, email от Google должен быть подтверждён. Существующий аккаунт с тем же email привязывается. Если его email не был подтверждён, он помечается подтверждённым, а `passwordHash` обнуляется: защита от захвата через заранее созданную регистрацию. Параметр `redirect` принимает только относительный путь.
- **Подтверждение email.** В v1 не обязательно для учёбы. В v2 оно станет условием покупки.

## 8. Данные

Схема — `prisma/schema.prisma`, Prisma 7: строка подключения задаётся в `prisma.config.ts`, клиент создаётся с `@prisma/adapter-pg` и генерируется в `src/generated/prisma`.

Соглашения:

- **Типы.** Идентификаторы — UUID, даты — UTC, деньги — целые сомы (`Int`).
- **Тексты контента** живут только в таблицах `*Translation`, у самих сущностей текстовых полей нет.
- **`Lesson.courseId`** — осознанная денормализация: slug урока уникален в пределах курса, потому что входит в URL. Сервисы следят, чтобы `courseId` урока совпадал с курсом его модуля.
- **Удаление.** У `Submission` и `LessonProgress` связи `onDelete: Restrict`, поэтому урок или задание со сдачами удалить нельзя (`HAS_SUBMISSIONS`).
- **`contentHash`** в переводах и заданиях нужен импорту, чтобы пропускать неизменённое.
- **Порядок элементов** задаётся полем `position`; при изменении порядка позиции переписываются целиком в одной транзакции.

## 9. Ошибки и логирование

Ошибки бросаются как `AppException(code, httpStatus, details?)` с кодами из `common/error-codes.ts`; этот список повторяет `DOMAIN.md`, раздел 6. `AllExceptionsFilter` превращает любую ошибку в `{ code, message, details? }`. Неизвестные ошибки становятся `INTERNAL_ERROR` и логируются со стеком, но стек никогда не уходит в ответ.

Логи пишет pino в JSON, в dev — в читаемом виде. Каждый запрос получает `requestId`. Заголовок `cookie`, поле `password` и токены из логов вырезаются.

## 10. Импорт контента

Команда: `pnpm content:import <путь> [--course <slug>] [--dry-run] [--force]`. Реализована на `nest-commander` и работает отдельным процессом с тем же `PrismaService`.

Алгоритм:

1. Прочитать и провалидировать весь пакет: zod-схемы по `CONTENT_FORMAT.md`. При любой ошибке остановиться и вывести список ошибок с путями к файлам.
2. Для каждого курса открыть транзакцию и сделать upsert сущностей по slug; порядок взять из числовых префиксов `NN-`.
3. Для переводов: новый или изменённый (по `contentHash`) получает статус `REVIEW`. Изменённый опубликованный перевод без `--force` пропускается с предупреждением; с `--force` перезаписывается и остаётся `PUBLISHED`.
4. Скопировать `assets/` в `MEDIA_DIR/<курс>/<урок>/` и переписать ссылки в Markdown на `/media/...`.
5. Ничего не удалять. Вывести отчёт: создано, обновлено, пропущено, «есть в БД, но нет в файлах».

Новые направления и курсы создаются с `isPublished = false`. `--dry-run` выполняет шаги 1–3 без записи и печатает отчёт.

## 11. Статистика

Считается SQL-запросами (`$queryRaw` с типизацией результата) по таблице `Submission`. По каждому заданию: сколько пользователей пытались, сколько сдали, доля успеха и медиана попыток до первой успешной сдачи (`percentile_cont(0.5)`). Для обзора: пользователи всего и за 7 дней, сдачи за 7 дней, завершённые уроки. В v1 кеш не нужен; если запросы станут медленными, перейдём на материализованное представление.

## 12. Безопасность

- `helmet`, строгие флаги куки, проверка `Origin` для изменяющих запросов.
- Лимиты запросов: `/auth/*` — 10 в минуту с одного IP, сдачи — 60 в минуту на пользователя, обращения — 5 в час.
- Защита от mass assignment: DTO с `whitelist` и `forbidNonWhitelisted`.
- Любой запрос к данным пользователя фильтруется по `userId` из сессии, никогда по `id` из тела запроса (защита от IDOR).
- `passwordHash`, `tokenHash` и `Exercise.solution` не уходят наружу; эталон — только через `learning_getSolution` после проверки `AccessService`.
- Параметры редиректа принимают только относительные пути (защита от open redirect).
- Сырые SQL-запросы — только через параметризованный `$queryRaw` с шаблонной строкой, никогда через `$queryRawUnsafe`.

## 13. Тестирование

| Уровень | Что покрываем | Как |
|---|---|---|
| Юнит | `access.rules.ts`, `pickTranslation`, парсинг и валидация импорта, переходы статусов | Jest, без БД; табличные тесты по `DOMAIN.md` |
| e2e | Аутентификация, права ролей, сдачи и прогресс, импорт | Jest + supertest, реальный PostgreSQL (база `edu_test`), таблицы очищаются перед каждым тестом, запуск последовательный (`--runInBand`) |

Хелперы в `test/`: фабрики (`createUser`, `createCourse`, …) и `loginAs(role)`, который возвращает куку. Все изменяющие e2e-запросы отправляются с заголовком `Origin: APP_URL`.

## 14. Конфигурация

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | Подключение к PostgreSQL |
| `APP_URL` | Публичный адрес сайта: проверка `Origin`, ссылки в письмах |
| `MEDIA_DIR` | Куда импорт кладёт картинки |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Отправка писем |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Вход через Google |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Только для сида |

Все переменные описаны в zod-схеме и в `.env.example`.

## 15. Развёртывание

Один VPS с Docker Compose: Caddy (HTTPS и маршрутизация), `web`, `api`, `postgres`, том `media`. Caddy отправляет `/api/*` в `api`, `/media/*` раздаёт из тома, всё остальное — в `web`. При старте `api` выполняется `prisma migrate deploy`. Бэкап — `pg_dump` раз в сутки с ротацией 14 дней и выгрузкой за пределы сервера. Файлы лежат в `deploy/`, подробности — в задаче INFRA-01.

## 16. Заделы под следующие версии

| Версия | Что добавится в бэкенде |
|---|---|
| v2 | Модуль `payments` (модель `Payment`, вебхуки провайдера, выдача `AccessGrant` с источником `PURCHASE`), модуль `quizzes` (квизы, тест на уровень, тесты на пропуск, поле `LessonProgress.skipped`), обязательное подтверждение email перед покупкой |
| v3 | Модуль `projects` (`Project`, `ProjectSubmission`, проверка через GitHub API), режим собеседования (`Exercise.isInterview`, `timeLimitSec` уже в схеме) |
| Позже | Модуль `assistant` (AI-помощник на базе Akylai), новые значения `Runtime` и серверная песочница |
