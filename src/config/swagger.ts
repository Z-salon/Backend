import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './env';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Z-Salon API',
    version: '1.0.0',
    description: 'OpenAPI documentation for the Z-Salon backend services.',
  },
  servers: [
    {
      url: `http://localhost:${config.port}${config.apiPrefix}`,
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

export const swaggerSpec = swaggerJsdoc({
  definition: swaggerDefinition,
  apis: ['./src/**/*.ts', './build/**/*.js'],
});
