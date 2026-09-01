import { SmsProvider } from './sms.types';
import { ConsoleSmsProvider } from './console-sms.provider';
import { config } from '../../../config/env';

let smsProvider: SmsProvider;

export function getSmsProvider(): SmsProvider {
  if (!smsProvider) {
    smsProvider = createSmsProvider();
  }
  return smsProvider;
}

function createSmsProvider(): SmsProvider {
  // In production, you would configure a real SMS provider here
  // For example:
  // if (config.sms.provider === 'twilio') {
  //   return new TwilioSmsProvider(config.sms.twilioAccountSid, config.sms.twilioAuthToken);
  // }
  
  return new ConsoleSmsProvider();
}

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  const provider = getSmsProvider();
  await provider.sendOtp(phone, otp);
}