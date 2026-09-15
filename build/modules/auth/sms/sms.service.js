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
exports.sendOtpSms = sendOtpSms;
exports.sendInvitationLinkSms = sendInvitationLinkSms;
exports.sendAppointmentConfirmationSms = sendAppointmentConfirmationSms;
exports.sendConfirmationRequestSms = sendConfirmationRequestSms;
exports.sendAppointmentCancellationSms = sendAppointmentCancellationSms;
exports.sendRefundApprovedSms = sendRefundApprovedSms;
exports.sendRefundRejectedSms = sendRefundRejectedSms;
exports.buildConfirmationUrl = buildConfirmationUrl;
const console_sms_provider_1 = require("./console-sms.provider");
let smsProvider;
function getSmsProvider() {
    if (!smsProvider) {
        smsProvider = createSmsProvider();
    }
    return smsProvider;
}
function createSmsProvider() {
    // In production, you would configure a real SMS provider here
    // For example:
    // if (config.sms.provider === 'twilio') {
    //   return new TwilioSmsProvider(config.sms.twilioAccountSid, config.sms.twilioAuthToken);
    // }
    return new console_sms_provider_1.ConsoleSmsProvider();
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
 * Generate the public customer-facing confirmation URL.
 * The frontend uses this token when calling public appointment-confirmation APIs.
 */
function buildConfirmationUrl(frontendBaseUrl, token) {
    return `${frontendBaseUrl}/appointments/confirm/${token}`;
}
