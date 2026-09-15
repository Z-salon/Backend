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

export async function sendInvitationLinkSms(phone: string, invitationUrl: string): Promise<void> {
  const provider = getSmsProvider();
  await provider.sendInvitationLink(phone, invitationUrl);
}

export async function sendAppointmentConfirmationSms(
  phone: string,
  scheduledStart: Date,
  scheduledEnd: Date
): Promise<void> {
  const provider = getSmsProvider();
  const start = scheduledStart.toISOString();
  const end = scheduledEnd.toISOString();
  await provider.sendMessage(
    phone,
    `Your appointment is confirmed from ${start} to ${end}.`
  );
}

export async function sendConfirmationRequestSms(
  phone: string,
  confirmationUrl: string,
  scheduledStart: Date
): Promise<void> {
  const provider = getSmsProvider();
  const start = scheduledStart.toLocaleString();
  await provider.sendMessage(
    phone,
    `Please confirm your appointment on ${start}. Confirm, reschedule, or cancel here: ${confirmationUrl}`
  );
}

export async function sendAppointmentCancellationSms(
  phone: string,
  scheduledStart: Date,
  reason?: string
): Promise<void> {
  const provider = getSmsProvider();
  const start = scheduledStart.toLocaleString();
  await provider.sendMessage(
    phone,
    `Your appointment on ${start} has been cancelled.${reason ? ` Reason: ${reason}` : ''}`
  );
}

export async function sendRefundApprovedSms(
  phone: string,
  amount: string | number,
  scheduledStart: Date
): Promise<void> {
  const provider = getSmsProvider();
  const start = scheduledStart.toLocaleString();
  await provider.sendMessage(
    phone,
    `Your refund of ${amount} for the appointment on ${start} has been approved. You will receive it shortly.`
  );
}

export async function sendRefundRejectedSms(
  phone: string,
  scheduledStart: Date,
  rejectionReason?: string
): Promise<void> {
  const provider = getSmsProvider();
  const start = scheduledStart.toLocaleString();
  await provider.sendMessage(
    phone,
    `Your refund request for the appointment on ${start} has been rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`
  );
}

/**
 * Generate the public customer-facing confirmation URL.
 * The frontend uses this token when calling public appointment-confirmation APIs.
 */
export function buildConfirmationUrl(frontendBaseUrl: string, token: string): string {
  return `${frontendBaseUrl}/appointments/confirm/${token}`;
}