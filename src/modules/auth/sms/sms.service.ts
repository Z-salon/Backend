import { DateTime } from 'luxon';
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
  // NOTE: only the console provider is implemented. Real production delivery is
  // NOT enabled until a provider (e.g. Twilio / Africa's Talking) is added here
  // and configured through SMS_PROVIDER + provider credentials. ConsoleSmsProvider
  // intentionally no-ops in production rather than pretending a message was sent.
  if (config.isProduction) {
    console.error(
      '[SMS] Real SMS delivery is not enabled (SMS_PROVIDER=%s). Customer reminder/confirmation messages will NOT be delivered in production until a provider is implemented.',
      config.sms.provider
    );
  }
  return new ConsoleSmsProvider();
}

/**
 * Format an appointment instant in the branch timezone for customer messages.
 * Timestamps are stored as UTC instants; all customer-facing text uses the
 * branch's local time.
 */
export function formatAppointmentDateTime(scheduledStart: Date, timezone: string): string {
  const dt = DateTime.fromJSDate(scheduledStart).setZone(timezone);
  if (!dt.isValid) {
    return DateTime.fromJSDate(scheduledStart).toUTC().toFormat("ccc, dd LLL yyyy 'at' HH:mm 'UTC'");
  }
  return dt.toFormat("ccc, dd LLL yyyy 'at' hh:mm a");
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
 * Sends the initial notification (view-only link) for an appointment awaiting
 * staff approval or prepayment verification. Does NOT request acknowledgement.
 */
export async function sendPendingApprovalSms(
  phone: string,
  appointmentUrl: string,
  scheduledStart: Date,
  timezone: string,
  branchName: string
): Promise<void> {
  const provider = getSmsProvider();
  const when = formatAppointmentDateTime(scheduledStart, timezone);
  await provider.sendMessage(
    phone,
    `${branchName}: We received your appointment request for ${when}. It is awaiting confirmation. View details: ${appointmentUrl}`
  );
}

/**
 * Sends the approved/confirmed notification after the existing approval or
 * prepayment workflow confirms the appointment. Includes the self-service link
 * but does not demand acknowledgement.
 */
export async function sendApprovalNotificationSms(
  phone: string,
  appointmentUrl: string,
  scheduledStart: Date,
  timezone: string,
  branchName: string
): Promise<void> {
  const provider = getSmsProvider();
  const when = formatAppointmentDateTime(scheduledStart, timezone);
  await provider.sendMessage(
    phone,
    `${branchName}: Your appointment on ${when} is confirmed. View, reschedule or cancel: ${appointmentUrl}`
  );
}

/**
 * Acknowledgement reminder. `stage` distinguishes the first reminder from the
 * shorter-notice second reminder so the copy can communicate urgency.
 */
export async function sendAcknowledgementReminderSms(
  phone: string,
  appointmentUrl: string,
  scheduledStart: Date,
  timezone: string,
  branchName: string,
  stage: 'FIRST' | 'SECOND'
): Promise<void> {
  const provider = getSmsProvider();
  const when = formatAppointmentDateTime(scheduledStart, timezone);
  const lead = stage === 'FIRST' ? 'tomorrow' : 'soon';
  await provider.sendMessage(
    phone,
    `${branchName}: Reminder - your appointment is ${lead} on ${when}. Please confirm: ${appointmentUrl}`
  );
}

/**
 * Generate the public customer-facing confirmation URL.
 * The frontend uses this token when calling public appointment-confirmation APIs.
 */
export function buildConfirmationUrl(frontendBaseUrl: string, token: string): string {
  return `${frontendBaseUrl}/appointments/confirm/${token}`;
}

/**
 * Notify a customer that they can leave feedback for a completed appointment.
 * Best-effort: callers must never let a failure here affect appointment state.
 */
export async function sendFeedbackRequestSms(
  phone: string,
  feedbackUrl: string
): Promise<void> {
  const provider = getSmsProvider();
  await provider.sendMessage(
    phone,
    `Thank you for visiting us! We'd love to hear your feedback: ${feedbackUrl}`
  );
}