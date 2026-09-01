"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.decodeToken = decodeToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const accessSignOptions = {
    expiresIn: env_1.config.jwt.accessExpiresIn,
};
const refreshSignOptions = {
    expiresIn: env_1.config.jwt.refreshExpiresIn,
};
function generateAccessToken(userId, sessionId) {
    const payload = {
        sub: userId,
        sessionId,
        type: 'access',
    };
    return jsonwebtoken_1.default.sign(payload, env_1.config.jwt.accessSecret, accessSignOptions);
}
function generateRefreshToken(userId, sessionId) {
    const payload = {
        sub: userId,
        sessionId,
        type: 'refresh',
    };
    return jsonwebtoken_1.default.sign(payload, env_1.config.jwt.refreshSecret, refreshSignOptions);
}
function verifyAccessToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.config.jwt.accessSecret);
        if (decoded.type !== 'access') {
            throw new Error('Invalid token type');
        }
        return decoded;
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            throw new Error('ACCESS_TOKEN_EXPIRED');
        }
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            throw new Error('INVALID_ACCESS_TOKEN');
        }
        throw error;
    }
}
function verifyRefreshToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_1.config.jwt.refreshSecret);
        if (decoded.type !== 'refresh') {
            throw new Error('Invalid token type');
        }
        return decoded;
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            throw new Error('REFRESH_TOKEN_EXPIRED');
        }
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            throw new Error('INVALID_REFRESH_TOKEN');
        }
        throw error;
    }
}
function decodeToken(token) {
    try {
        return jsonwebtoken_1.default.decode(token);
    }
    catch (_a) {
        return null;
    }
}
