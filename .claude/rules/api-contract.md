---
paths:
  - "src/modules/**/*.controller.ts"
  - "src/modules/**/dto/**"
  - "src/common/decorators/**"
---

# Контракт API (OpenAPI)

Фронтенд генерирует типы, функции и хуки из OpenAPI через Kubb. Всё, что не описано в Swagger, для фронтенда не существует, а неточное описание превращается в неверные типы на фронте.

- **operationId.** У каждого метода контроллера есть `@ApiOperation({ operationId, summary })`, `operationId` берётся из таблицы `docs/ARCHITECTURE-BACKEND.md`, раздел 6. Переименование `operationId` ломает фронтенд: только по задаче и с пометкой в PR.
- **Ответ.** Каждый метод объявляет ответ: `@ApiOkResponse({ type })`, `@ApiCreatedResponse({ type })` или `@ApiNoContentResponse()`. Для списков — `type: [Dto]` или `PageResponse`.
- **Ошибки.** Все коды ошибок, которые может вернуть метод, перечислены в `@ApiErrors(...)`.
- **Перечисления.** Для enum указывается `enumName` (`@ApiProperty({ enum: Locale, enumName: 'Locale' })`), иначе Kubb создаст дубли типов.
- **Входные DTO.** Только class-validator и `@ApiProperty`. Необязательные поля: `@IsOptional()` + `@ApiPropertyOptional()`.
- **Выходные DTO.** Отдельные классы с суффиксом `ResponseDto` и функция маппинга `toXxxResponse()`. Модели Prisma из контроллера не возвращаются.
- **Даты** в ответах — ISO-строки (`toISOString()`).
- **Тонкий контроллер.** Контроллер только разбирает параметры, вызывает сервис и маппит результат. Никакой бизнес-логики и прямых обращений к Prisma.
- **Синхронизация документации.** Новый или изменённый эндпоинт добавляется в таблицу `docs/ARCHITECTURE-BACKEND.md`, раздел 6, в том же PR.
