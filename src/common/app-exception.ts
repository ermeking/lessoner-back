import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface AppExceptionDetail {
  field: string;
  rule: string;
}

export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    httpStatus: HttpStatus,
    public readonly details?: AppExceptionDetail[],
    // Для логов и отладки (docs/DOMAIN-SHARED.md, разд. 6); по умолчанию — сам код.
    message: string = code,
  ) {
    super({ code, message, details }, httpStatus);
  }
}
