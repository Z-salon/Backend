import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { errorResponse } from '../utils/api-response';
import { config } from '../config/env';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('❌ Error:', error.message);
  
  if (config.isDevelopment) {
    console.error(error.stack);
  }

  if (error instanceof ApiError) {
    res.status(error.statusCode).json(
      errorResponse(error.message, error.code, error.details)
    );
    return;
  }

  if (error instanceof ZodError) {
    const details = error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(400).json(
      errorResponse('Validation failed', ErrorCodes.VALIDATION_ERROR, details)
    );
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    handlePrismaError(error, res);
    return;
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json(
      errorResponse('Invalid data provided', ErrorCodes.VALIDATION_ERROR)
    );
    return;
  }

  if (error instanceof TokenExpiredError) {
    res.status(401).json(
      errorResponse('Token has expired', ErrorCodes.TOKEN_EXPIRED)
    );
    return;
  }

  if (error instanceof JsonWebTokenError) {
    res.status(401).json(
      errorResponse('Invalid token', ErrorCodes.INVALID_TOKEN)
    );
    return;
  }

  res.status(500).json(
    errorResponse(
      config.isProduction ? 'Internal server error' : error.message,
      ErrorCodes.INTERNAL_ERROR,
      config.isDevelopment ? error.stack : undefined
    )
  );
}

function handlePrismaError(
  error: Prisma.PrismaClientKnownRequestError,
  res: Response
): void {
  switch (error.code) {
    case 'P2002': {
      const target = (error.meta?.target as string[]) || [];
      const field = target.join(', ');
      res.status(409).json(
        errorResponse(
          `${field} already exists`,
          'DUPLICATE_ENTRY',
          { field }
        )
      );
      break;
    }
    case 'P2003': {
      const field = (error.meta?.field_name as string) || 'foreign key';
      res.status(400).json(
        errorResponse(
          `Invalid ${field}`,
          'INVALID_REFERENCE',
          { field }
        )
      );
      break;
    }
    case 'P2025': {
      res.status(404).json(
        errorResponse('Record not found', 'NOT_FOUND')
      );
      break;
    }
    default: {
      res.status(500).json(
        errorResponse(
          config.isProduction ? 'Database error' : error.message,
          'DATABASE_ERROR'
        )
      );
    }
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(
    errorResponse(`Route ${req.method} ${req.path} not found`, 'NOT_FOUND')
  );
}