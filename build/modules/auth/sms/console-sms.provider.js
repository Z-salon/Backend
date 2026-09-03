"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleSmsProvider = void 0;
const env_1 = require("../../../config/env");
class ConsoleSmsProvider {
    sendOtp(phone, otp) {
        return __awaiter(this, void 0, void 0, function* () {
            if (env_1.config.isProduction) {
                console.warn('⚠️ ConsoleSmsProvider should not be used in production');
                return;
            }
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📱 SMS OTP (Development Mode)');
            console.log(`📞 To: ${phone}`);
            console.log(`🔐 OTP: ${otp}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        });
    }
    sendInvitationLink(phone, invitationUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            if (env_1.config.isProduction) {
                console.warn('⚠️ ConsoleSmsProvider should not be used in production');
                return;
            }
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📱 Invitation SMS (Development Mode)');
            console.log(`📞 To: ${phone}`);
            console.log(`🔗 Invite link: ${invitationUrl}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        });
    }
}
exports.ConsoleSmsProvider = ConsoleSmsProvider;
// Future implementation for production SMS providers
// export class TwilioSmsProvider implements SmsProvider {
//   private client: Twilio;
//
//   constructor(accountSid: string, authToken: string) {
//     this.client = new Twilio(accountSid, authToken);
//   }
//
//   async sendOtp(phone: string, otp: string): Promise<void> {
//     await this.client.messages.create({
//       body: `Your verification code is: ${otp}`,
//       from: process.env.TWILIO_FROM_NUMBER,
//       to: phone,
//     });
//   }
// }
