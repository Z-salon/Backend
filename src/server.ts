import { startServer } from './app';

async function main() {
  try {
    console.log('🔄 Starting server...');
    await startServer();
    console.log('✅ startServer completed');
    
    // Keep the process alive
    setInterval(() => {}, 1000);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
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