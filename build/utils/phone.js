"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhone = normalizePhone;
exports.isValidPhone = isValidPhone;
exports.formatPhoneForDisplay = formatPhoneForDisplay;
const libphonenumber_js_1 = require("libphonenumber-js");
function normalizePhone(phone) {
    const phoneNumber = (0, libphonenumber_js_1.parsePhoneNumberFromString)(phone);
    if (!phoneNumber || !phoneNumber.isValid()) {
        throw new Error('Invalid phone number');
    }
    return phoneNumber.format('E.164');
}
function isValidPhone(phone) {
    return (0, libphonenumber_js_1.isValidPhoneNumber)(phone);
}
function formatPhoneForDisplay(phone) {
    const phoneNumber = (0, libphonenumber_js_1.parsePhoneNumberFromString)(phone);
    return phoneNumber ? phoneNumber.format('INTERNATIONAL') : phone;
}
