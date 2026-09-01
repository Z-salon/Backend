"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = require("jsonwebtoken");
const api_error_1 = require("../utils/api-error");
const api_response_1 = require("../utils/api-response");
const env_1 = require("../config/env");
function errorHandler(error, req, res, next) {
    console.error('❌ Error:', error.message);
    if (env_1.config.isDevelopment) {
        console.error(error.stack);
    }
    if (error instanceof api_error_1.ApiError) {
        res.status(error.statusCode).json((0, api_response_1.errorResponse)(error.message, error.code, error.details));
        return;
    }
    if (error instanceof zod_1.ZodError) {
        const details = error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
        }));
        res.status(400).json((0, api_response_1.errorResponse)('Validation failed', api_error_1.ErrorCodes.VALIDATION_ERROR, details));
        return;
    }
    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        handlePrismaError(error, res);
        return;
    }
    if (error instanceof client_1.Prisma.PrismaClientValidationError) {
        res.status(400).json((0, api_response_1.errorResponse)('Invalid data provided', api_error_1.ErrorCodes.VALIDATION_ERROR));
        return;
    }
    if (error instanceof jsonwebtoken_1.TokenExpiredError) {
        res.status(401).json((0, api_response_1.errorResponse)('Token has expired', api_error_1.ErrorCodes.TOKEN_EXPIRED));
        return;
    }
    if (error instanceof jsonwebtoken_1.JsonWebTokenError) {
        res.status(401).json((0, api_response_1.errorResponse)('Invalid token', api_error_1.ErrorCodes.INVALID_TOKEN));
        return;
    }
    res.status(500).json((0, api_response_1.errorResponse)(env_1.config.isProduction ? 'Internal server error' : error.message, api_error_1.ErrorCodes.INTERNAL_ERROR, env_1.config.isDevelopment ? error.stack : undefined));
}
function handlePrismaError(error, res) {
    var _a, _b;
    switch (error.code) {
        case 'P2002': {
            const target = ((_a = error.meta) === null || _a === void 0 ? void 0 : _a.target) || [];
            const field = target.join(', ');
            res.status(409).json((0, api_response_1.errorResponse)(`${field} already exists`, 'DUPLICATE_ENTRY', { field }));
            break;
        }
        case 'P2003': {
            const field = ((_b = error.meta) === null || _b === void 0 ? void 0 : _b.field_name) || 'foreign key';
            res.status(400).json((0, api_response_1.errorResponse)(`Invalid ${field}`, 'INVALID_REFERENCE', { field }));
            break;
        }
        case 'P2025': {
            res.status(404).json((0, api_response_1.errorResponse)('Record not found', 'NOT_FOUND'));
            break;
        }
        default: {
            res.status(500).json((0, api_response_1.errorResponse)(env_1.config.isProduction ? 'Database error' : error.message, 'DATABASE_ERROR'));
        }
    }
}
function notFoundHandler(req, res) {
    res.status(404).json((0, api_response_1.errorResponse)(`Route ${req.method} ${req.path} not found`, 'NOT_FOUND'));
}
