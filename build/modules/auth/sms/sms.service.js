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
exports.getSmsProvider = getSmsProvider;
exports.formatAppointmentDateTime = formatAppointmentDateTime;
exports.sendOtpSms = sendOtpSms;
exports.sendInvitationLinkSms = sendInvitationLinkSms;
exports.sendAppointmentConfirmationSms = sendAppointmentConfirmationSms;
exports.sendConfirmationRequestSms = sendConfirmationRequestSms;
exports.sendAppointmentCancellationSms = sendAppointmentCancellationSms;
exports.sendRefundApprovedSms = sendRefundApprovedSms;
exports.sendRefundRejectedSms = sendRefundRejectedSms;
exports.sendPendingApprovalSms = sendPendingApprovalSms;
exports.sendApprovalNotificationSms = sendApprovalNotificationSms;
exports.sendAcknowledgementReminderSms = sendAcknowledgementReminderSms;
exports.buildConfirmationUrl = buildConfirmationUrl;
exports.sendFeedbackRequestSms = sendFeedbackRequestSms;
const luxon_1 = require("luxon");
const console_sms_provider_1 = require("./console-sms.provider");
const env_1 = require("../../../config/env");
let smsProvider;
function getSmsProvider() {
    if (!smsProvider) {
        smsProvider = createSmsProvider();
    }
    return smsProvider;
}
function createSmsProvider() {
    // NOTE: only the console provider is implemented. Real production delivery is
    // NOT enabled until a provider (e.g. Twilio / Africa's Talking) is added here
    // and configured through SMS_PROVIDER + provider credentials. ConsoleSmsProvider
    // intentionally no-ops in production rather than pretending a message was sent.
    if (env_1.config.isProduction) {
        console.error('[SMS] Real SMS delivery is not enabled (SMS_PROVIDER=%s). Customer reminder/confirmation messages will NOT be delivered in production until a provider is implemented.', env_1.config.sms.provider);
    }
    return new console_sms_provider_1.ConsoleSmsProvider();
}
/**
 * Format an appointment instant in the branch timezone for customer messages.
 * Timestamps are stored as UTC instants; all customer-facing text uses the
 * branch's local time.
 */
function formatAppointmentDateTime(scheduledStart, timezone) {
    const dt = luxon_1.DateTime.fromJSDate(scheduledStart).setZone(timezone);
    if (!dt.isValid) {
        return luxon_1.DateTime.fromJSDate(scheduledStart).toUTC().toFormat("ccc, dd LLL yyyy 'at' HH:mm 'UTC'");
    }
    return dt.toFormat("ccc, dd LLL yyyy 'at' hh:mm a");
}
function sendOtpSms(phone, otp) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = getSmsProvider();
        yield provider.sendOtp(phone, otp);
    });
}
function sendInvitationLinkSms(phone, invitationUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = getSmsProvider();
        yield provider.sendInvitationLink(phone, invitationUrl);
    });
}
function sendAppointmentConfirmationSms(phone, scheduledStart, scheduledEnd) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = getSmsProvider();
        const start = scheduledStart.toISOString();
        const end = scheduledEnd.toISOString();
        yield provider.sendMessage(phone, `Your appointment is confirmed from ${start} to ${end}.`);
    });
}
function sendConfirmationRequestSms(phone, confirmationUrl, scheduledStart) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = getSmsProvider();
        const start = scheduledStart.toLocaleString();
        yield provider.sendMessage(phone, `Please confirm your appointment on ${start}. Confirm, reschedule, or cancel here: ${confirmationUrl}`);
    });
}
function sendAppointmentCancellationSms(phone, scheduledStart, reason) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = getSmsProvider();
        const start = scheduledStart.toLocaleString();
        yield provider.sendMessage(phone, `Your appointment on ${start} has been cancelled.${reason ? ` Reason: ${reason}` : ''}`);
    });
}
function sendRefundApprovedSms(phone, amount, scheduledStart) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = getSmsProvider();
        const start = scheduledStart.toLocaleString();
        yield provider.sendMessage(phone, `Your refund of ${amount} for the appointment on ${start} has been approved. You will receive it shortly.`);
    });
}
function sendRefundRejectedSms(phone, scheduledStart, rejectionReason) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = getSmsProvider();
        const start = scheduledStart.toLocaleString();
        yield provider.sendMessage(phone, `Your refund request for the appointment on ${start} has been rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`);
    });
}
/**
 * Sends the initial notification (view-only link) for an appointment awaiting
 * staff approval or prepayment verification. Does NOT request acknowledgement.
 */
function sendPendingApprovalSms(phone, appointmentUrl, scheduledStart, timezone, branchName) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = getSmsProvider();
        const when = formatAppointmentDateTime(scheduledStart, timezone);
        yield provider.sendMessage(phone, `${branchName}: We received your appointment request for ${when}. It is awaiting confirmation. View details: ${appointmentUrl}`);
    });
}
/**
 * Sends the approved/confirmed notification after the existing approval or
 * prepayment workflow confirms the appointment. Includes the self-service link
 * but does not demand acknowledgement.
 */
function sendApprovalNotificationSms(phone, appointmentUrl, scheduledStart, timezone, branchName) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = getSmsProvider();
        const when = formatAppointmentDateTime(scheduledStart, timezone);
        yield provider.sendMessage(phone, `${branchName}: Your appointment on ${when} is confirmed. View, reschedule or cancel: ${appointmentUrl}`);
    });
}
/**
 * Acknowledgement reminder. `stage` distinguishes the first reminder from the
 * shorter-notice second reminder so the copy can communicate urgency.
 */
function sendAcknowledgementReminderSms(phone, appointmentUrl, scheduledStart, timezone, branchName, stage) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = getSmsProvider();
        const when = formatAppointmentDateTime(scheduledStart, timezone);
        const lead = stage === 'FIRST' ? 'tomorrow' : 'soon';
        yield provider.sendMessage(phone, `${branchName}: Reminder - your appointment is ${lead} on ${when}. Please confirm: ${appointmentUrl}`);
    });
}
/**
 * Generate the public customer-facing confirmation URL.
 * The frontend uses this token when calling public appointment-confirmation APIs.
 */
function buildConfirmationUrl(frontendBaseUrl, token) {
    return `${frontendBaseUrl}/appointments/confirm/${token}`;
}
/**
 * Notify a customer that they can leave feedback for a completed appointment.
 * Best-effort: callers must never let a failure here affect appointment state.
 */
function sendFeedbackRequestSms(phone, feedbackUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = getSmsProvider();
        yield provider.sendMessage(phone, `Thank you for visiting us! We'd love to hear your feedback: ${feedbackUrl}`);
    });
}
