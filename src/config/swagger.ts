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
      url: `http://localhost:${config.port}`,
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
            enum: ['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'PHONE_VERIFICATION', 'INVITATION_ACCEPTANCE', 'PHONE_CHANGE'],
            example: 'LOGIN',
          },
        },
      },
      OtpVerify: {
        type: 'object',
        required: ['phone', 'otp', 'purpose'],
        properties: {
          phone: { type: 'string', example: '+251912345678' },
          otp: { type: 'string', example: '123456' },
          purpose: {
            type: 'string',
            enum: ['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'PHONE_VERIFICATION', 'INVITATION_ACCEPTANCE', 'PHONE_CHANGE'],
            example: 'LOGIN',
          },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['phone', 'password', 'business'],
        properties: {
          phone: { type: 'string', example: '+251912345678' },
          password: { type: 'string', example: 'StrongPass1' },
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
      RegisterVerifyRequest: {
        type: 'object',
        required: ['phone', 'otp'],
        properties: {
          phone: { type: 'string', example: '+251912345678' },
          otp: { type: 'string', example: '123456' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone: { type: 'string', example: '+251912345678' },
          password: { type: 'string', example: 'StrongPass1' },
        },
      },
      LoginCompleteRequest: {
        type: 'object',
        required: ['verificationToken'],
        properties: {
          verificationToken: { type: 'string', example: 'abcd-1234' },
        },
      },
      ForgotPasswordRequest: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', example: '+251912345678' },
        },
      },
      VerifyPasswordResetRequest: {
        type: 'object',
        required: ['phone', 'otp'],
        properties: {
          phone: { type: 'string', example: '+251912345678' },
          otp: { type: 'string', example: '123456' },
        },
      },
      ResetPasswordRequest: {
        type: 'object',
        required: ['passwordResetToken', 'newPassword'],
        properties: {
          passwordResetToken: { type: 'string', example: 'abcd-1234' },
          newPassword: { type: 'string', example: 'NewStrongPass1' },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', example: 'OldStrongPass1' },
          newPassword: { type: 'string', example: 'NewStrongPass1' },
        },
      },
      ChangePhoneRequestRequest: {
        type: 'object',
        required: ['currentPassword', 'newPhone'],
        properties: {
          currentPassword: { type: 'string', example: 'StrongPass1' },
          newPhone: { type: 'string', example: '+251987654321' },
        },
      },
      ChangePhoneVerifyRequest: {
        type: 'object',
        required: ['newPhone', 'otp'],
        properties: {
          newPhone: { type: 'string', example: '+251987654321' },
          otp: { type: 'string', example: '123456' },
        },
      },
      ResendOtpRequest: {
        type: 'object',
        required: ['phone', 'purpose'],
        properties: {
          phone: { type: 'string', example: '+251912345678' },
          purpose: {
            type: 'string',
            enum: ['LOGIN', 'REGISTRATION', 'PASSWORD_RESET', 'PHONE_VERIFICATION', 'INVITATION_ACCEPTANCE', 'PHONE_CHANGE'],
            example: 'LOGIN',
          },
        },
      },
      InvitationRoleAssignment: {
        type: 'object',
        required: ['roleId', 'scopeType'],
        properties: {
          roleId: {
            type: 'string',
            format: 'uuid',
            example: '550e8400-e29b-41d4-a716-446655440000',
          },
          scopeType: {
            type: 'string',
            enum: ['BUSINESS', 'BRANCH'],
            example: 'BUSINESS',
          },
          branchIds: {
            type: 'array',
            items: {
              type: 'string',
              format: 'uuid',
            },
            example: ['550e8400-e29b-41d4-a716-446655440000'],
          },
        },
      },
      InvitationCreateRequest: {
        type: 'object',
        required: ['phone', 'roles'],
        properties: {
          phone: { type: 'string', example: '+251912345678' },
          roles: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/components/schemas/InvitationRoleAssignment' },
          },
        },
      },
      InvitationRegisterRequest: {
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone: { type: 'string', example: '+251912345678' },
          password: { type: 'string', example: 'StrongPass1' },
        },
      },
      InvitationAcceptRequest: {
        type: 'object',
        required: ['phone'],
        properties: {
          invitationId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
          phone: { type: 'string', example: '+251912345678' },
          verificationToken: { type: 'string', example: 'abc123-token' },
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
