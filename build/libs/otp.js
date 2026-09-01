"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOtp = generateOtp;
exports.hashOtp = hashOtp;
exports.verifyOtp = verifyOtp;
exports.generateVerificationToken = generateVerificationToken;
exports.hashVerificationToken = hashVerificationToken;
const crypto_1 = require("crypto");
const env_1 = require("../config/env");
function generateOtp() {
    const length = env_1.config.otp.length;
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    const otp = (0, crypto_1.randomInt)(min, max + 1).toString();
    const otpHash = hashOtp(otp);
    return { otp, otpHash };
}
function hashOtp(otp) {
    return (0, crypto_1.createHash)('sha256').update(otp).digest('hex');
}
function verifyOtp(otp, otpHash) {
    const hash = hashOtp(otp);
    try {
        return (0, crypto_1.timingSafeEqual)(Buffer.from(hash), Buffer.from(otpHash));
    }
    catch (_a) {
        return false;
    }
}
function generateVerificationToken() {
    const bytes = (0, crypto_1.randomInt)(0, 2 ** 32 - 1).toString(16).padStart(8, '0');
    const timestamp = Date.now().toString(16);
    return `${timestamp}-${bytes}`;
}
function hashVerificationToken(token) {
    return (0, crypto_1.createHash)('sha256').update(token).digest('hex');
}
