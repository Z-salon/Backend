"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
class Config {
    constructor() {
        this.nodeEnv = process.env.NODE_ENV || 'development';
        this.port = parseInt(process.env.PORT, 10) || 3000;
        this.databaseUrl = this.getDatabaseUrl();
    }
    static getInstance() {
        if (!Config.instance) {
            Config.instance = new Config();
        }
        return {
            databaseUrl: Config.instance.databaseUrl,
            nodeEnv: Config.instance.nodeEnv,
            port: Config.instance.port,
        };
    }
    getDatabaseUrl() {
        if (this.nodeEnv === 'development') {
            return process.env.DATABASE_LOCAL || '';
        }
        else {
            return process.env.DATABASE_URL || '';
        }
    }
}
exports.config = Config.getInstance();
