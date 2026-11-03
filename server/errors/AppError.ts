export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: readonly string[];

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST', details?: readonly string[]) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class DtoValidationError extends AppError {
  constructor(message: string, details?: readonly string[]) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado. Faça login para continuar.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado a este recurso.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado.') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.') {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}
