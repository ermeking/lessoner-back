import { HttpStatus } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { AppException, AppExceptionDetail } from './app-exception';
import { ErrorCode } from './error-codes';

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): AppExceptionDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const ownRules = Object.keys(error.constraints ?? {}).map((rule) => ({
      field,
      rule,
    }));
    const childRules = error.children?.length
      ? flattenValidationErrors(error.children, field)
      : [];
    return [...ownRules, ...childRules];
  });
}

export function validationExceptionFactory(
  errors: ValidationError[],
): AppException {
  return new AppException(
    ErrorCode.VALIDATION_ERROR,
    HttpStatus.BAD_REQUEST,
    flattenValidationErrors(errors),
  );
}
