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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const env_1 = require("./config/env");
const swagger_1 = require("./config/swagger");
const routes_1 = __importDefault(require("./routes"));
const error_handler_1 = require("./middlewares/error-handler");
const redis_1 = require("./config/redis");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use((0, cors_1.default)({
    origin: env_1.config.cors.origin,
    credentials: env_1.config.cors.credentials,
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)(env_1.config.cookie.secret));
app.get('/api-docs.json', (_req, res) => {
    res.json(swagger_1.swaggerSpec);
});
app.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec, {
    explorer: true,
    customSiteTitle: 'Z-Salon API Docs',
}));
app.use(env_1.config.apiPrefix, routes_1.default);
app.use(error_handler_1.notFoundHandler);
app.use(error_handler_1.errorHandler);
function startServer() {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, redis_1.connectRedis)();
        return new Promise((resolve, reject) => {
            const server = app.listen(env_1.config.port, '127.0.0.1', () => {
                console.log(`🚀 Server running on port ${env_1.config.port} in ${env_1.config.nodeEnv} mode`);
                console.log(`📚 API available at http://localhost:${env_1.config.port}${env_1.config.apiPrefix}`);
                console.log(`📖 Swagger docs available at http://localhost:${env_1.config.port}/docs`);
                const address = server.address();
                console.log(`🔍 Actual server address:`, address);
                resolve();
            });
            server.on('error', (err) => {
                console.error('❌ Server error:', err);
                reject(err);
            });
        });
    });
}
exports.default = app;
