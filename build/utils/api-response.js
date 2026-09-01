"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.successResponse = successResponse;
exports.errorResponse = errorResponse;
function successResponse(message, data, code) {
    return {
        success: true,
        message,
        data,
        code,
    };
}
function errorResponse(message, code, details) {
    return {
        success: false,
        message,
        code,
        details,
    };
}
