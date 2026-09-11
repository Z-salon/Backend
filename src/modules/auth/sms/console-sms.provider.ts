import { SmsProvider } from './sms.types';
import { config } from '../../../config/env';

export class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(phone: string, otp: string): Promise<void> {
    if (config.isProduction) {
      console.warn('⚠️ ConsoleSmsProvider should not be used in production');
      return;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 SMS OTP (Development Mode)');
    console.log(`📞 To: ${phone}`);
    console.log(`🔐 OTP: ${otp}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  async sendInvitationLink(phone: string, invitationUrl: string): Promise<void> {
    if (config.isProduction) {
      console.warn('⚠️ ConsoleSmsProvider should not be used in production');
      return;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 Invitation SMS (Development Mode)');
    console.log(`📞 To: ${phone}`);
    console.log(`🔗 Invite link: ${invitationUrl}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  async sendMessage(phone: string, message: string): Promise<void> {
    if (config.isProduction) {
      console.warn('⚠️ ConsoleSmsProvider should not be used in production');
      return;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 SMS (Development Mode)');
    console.log(`📞 To: ${phone}`);
    console.log(`💬 ${message}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
}

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