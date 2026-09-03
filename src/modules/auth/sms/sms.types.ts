export interface SmsProvider {
  sendOtp(phone: string, otp: string): Promise<void>;
  sendInvitationLink(phone: string, invitationUrl: string): Promise<void>;
}

export interface SmsProviderConfig {
  provider: 'console' | 'twilio' | 'custom';
}