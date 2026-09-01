import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/env';
import { swaggerSpec } from './config/swagger';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { connectRedis } from './config/redis';

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(config.cookie.secret));

app.get('/api-docs.json', (_req, res) => {
  res.json(swaggerSpec);
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customSiteTitle: 'Z-Salon API Docs',
}));

app.use(config.apiPrefix, routes);

app.use(notFoundHandler);
app.use(errorHandler);

export async function startServer(): Promise<void> {
  await connectRedis();
  
  return new Promise<void>((resolve, reject) => {
    const server = app.listen(config.port, '127.0.0.1', () => {
      console.log(`🚀 Server running on port ${config.port} in ${config.nodeEnv} mode`);
      console.log(`📚 API available at http://localhost:${config.port}${config.apiPrefix}`);
      console.log(`📖 Swagger docs available at http://localhost:${config.port}/docs`);
      const address = server.address();
      console.log(`🔍 Actual server address:`, address);
      resolve();
    });
    
    server.on('error', (err) => {
      console.error('❌ Server error:', err);
      reject(err);
    });
  });
}

export default app;