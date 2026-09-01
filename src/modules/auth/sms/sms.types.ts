export interface SmsProvider {
  sendOtp(phone: string, otp: string): Promise<void>;
}

export interface SmsProviderConfig {
  provider: 'console' | 'twilio' | 'custom';
}