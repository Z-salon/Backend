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
const app_1 = require("./app");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('🔄 Starting server...');
            yield (0, app_1.startServer)();
            console.log('✅ startServer completed');
            // Keep the process alive
            setInterval(() => { }, 1000);
        }
        catch (error) {
            console.error('❌ Failed to start server:', error);
            process.exit(1);
        }
    });
}
main();
process.on('exit', (code) => {
    console.log(`🔚 Process exiting with code: ${code}`);
});
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
});
