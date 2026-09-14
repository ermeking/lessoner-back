# Шаблоны кода для edu-api

Пример — эндпоинт `POST /reports` (`reports_create`). Замени имена на свои.
Глобально настроены префикс `api` и `defaultVersion: '1'`, поэтому путь в контроллере указывается без `/api/v1`.

## DTO запроса — `dto/create-report.dto.ts`

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Locale } from '../../../generated/prisma/client';

export class CreateReportDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  lessonId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  exerciseId?: string;

  @ApiProperty({ minLength: 5, maxLength: 2000 })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  message!: string;

  @ApiProperty({ enum: Locale, enumName: 'Locale' })
  @IsEnum(Locale)
  locale!: Locale;
}
```

## DTO ответа и маппинг — `dto/report-response.dto.ts`

```ts
import { ApiProperty } from '@nestjs/swagger';
import { ProblemReport, ReportStatus } from '../../../generated/prisma/client';

export class ReportResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ReportStatus, enumName: 'ReportStatus' })
  status!: ReportStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export function toReportResponse(report: ProblemReport): ReportResponseDto {
  return {
    id: report.id,
    status: report.status,
    createdAt: report.createdAt.toISOString(),
  };
}
```

## Сервис — `reports.service.ts`

```ts
import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app-exception';
import { ErrorCode } from '../../common/error-codes';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateReportDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
      select: { id: true },
    });
    if (!lesson) {
      throw new AppException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    return this.prisma.problemReport.create({
      data: {
        userId, // только из сессии, никогда из тела запроса
        lessonId: dto.lessonId,
        exerciseId: dto.exerciseId,
        message: dto.message,
        locale: dto.locale,
      },
    });
  }
}
```

## Контроллер — `reports.controller.ts`

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiErrors } from '../../common/decorators/api-errors.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportResponseDto, toReportResponse } from './dto/report-response.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // Без @Public / @OptionalAuth — значит, нужен вход (SessionGuard глобальный).
  @Post()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({ operationId: 'reports_create', summary: 'Сообщить о проблеме в уроке или задании' })
  @ApiCreatedResponse({ type: ReportResponseDto })
  @ApiErrors('VALIDATION_ERROR', 'UNAUTHORIZED', 'NOT_FOUND', 'RATE_LIMITED')
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReportDto,
  ): Promise<ReportResponseDto> {
    const report = await this.reports.create(user.id, dto);
    return toReportResponse(report);
  }
}
```

## Эндпоинт для админки

```ts
@Roles('REVIEWER', 'ADMIN')
@Get()
@ApiOperation({ operationId: 'adminReports_list' })
@ApiOkResponse({ type: ReportPageResponseDto })
@ApiErrors('UNAUTHORIZED', 'FORBIDDEN')
list(@Query() query: ListReportsQueryDto) { /* … */ }
```

Для пагинации DTO запроса наследуется от `PageQueryDto` (`page`, `pageSize`), а ответ — это класс с полями `items`, `total`, `page`, `pageSize` и явным `@ApiProperty({ type: [ReportResponseDto] })` у `items`. Kubb не понимает дженерики Swagger, поэтому на каждый список создаётся свой класс.

## Табличный юнит-тест чистых правил

```ts
import { getLessonState, LessonStateInput } from './access.rules';

const base: LessonStateInput = {
  isFreeCourse: true, isPreview: false, hasGrant: false,
  isFirstInCourse: false, previousCompleted: false, isCompleted: false,
};

it.each<[string, Partial<LessonStateInput>, string]>([
  ['завершённый урок',              { isCompleted: true },                                         'COMPLETED'],
  ['первый урок бесплатного курса', { isFirstInCourse: true },                                     'AVAILABLE'],
  ['предыдущий не завершён',        {},                                                            'LOCKED'],
  ['платный урок без доступа',      { isFreeCourse: false },                                       'NO_ACCESS'],
  ['платный превью-урок, первый',   { isFreeCourse: false, isPreview: true, isFirstInCourse: true }, 'AVAILABLE'],
])('%s', (_name, patch, expected) => {
  expect(getLessonState({ ...base, ...patch })).toBe(expected);
});
```
