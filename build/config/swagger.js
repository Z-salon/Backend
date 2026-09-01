"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.swaggerSpec = void 0;
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const env_1 = require("./env");
const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'Z-Salon API',
        version: '1.0.0',
        description: 'OpenAPI documentation for the Z-Salon backend services.',
    },
    servers: [
        {
            url: `http://localhost:${env_1.config.port}${env_1.config.apiPrefix}`,
            description: 'Local development server',
        },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
            },
        },
        schemas: {
            ErrorResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Something went wrong' },
                },
            },
            OtpRequest: {
                type: 'object',
                required: ['phone', 'purpose'],
                properties: {
                    phone: { type: 'string', example: '+251912345678' },
                    purpose: {
                        type: 'string',
                        enum: ['LOGIN', 'REGISTRATION', 'INVITATION_ACCEPTANCE', 'PHONE_CHANGE'],
                        example: 'LOGIN',
                    },
                },
            },
            OtpVerify: {
                type: 'object',
                required: ['phone', 'otp'],
                properties: {
                    phone: { type: 'string', example: '+251912345678' },
                    otp: { type: 'string', example: '123456' },
                },
            },
            RegisterRequest: {
                type: 'object',
                required: ['phone', 'verificationToken', 'business'],
                properties: {
                    phone: { type: 'string', example: '+251912345678' },
                    verificationToken: { type: 'string', example: 'abcd-1234' },
                    business: {
                        type: 'object',
                        required: ['name'],
                        properties: {
                            name: { type: 'string', example: 'Royal Beauty Studio' },
                            currency: { type: 'string', example: 'ETB' },
                            timezone: { type: 'string', example: 'Africa/Addis_Ababa' },
                        },
                    },
                },
            },
            AuthResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Request successful' },
                    data: {
                        type: 'object',
                        additionalProperties: true,
                    },
                },
            },
        },
    },
};
exports.swaggerSpec = (0, swagger_jsdoc_1.default)({
    definition: swaggerDefinition,
    apis: ['./src/**/*.ts', './build/**/*.js'],
});
