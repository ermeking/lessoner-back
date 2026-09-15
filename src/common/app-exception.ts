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
  ) {
    super({ code, message: code, details }, httpStatus);
  }
}
