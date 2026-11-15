import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { AppModule } from './app.module';
import { config } from './config';
import { SessionService } from './auth/session.service';
import { RealtimeService } from './thingsboard/realtime.service';

class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof ZodError) {
      response
        .status(400)
        .json({ message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
      return;
    }
    if (error instanceof HttpException) {
      response.status(error.getStatus()).json({ message: error.message });
      return;
    }
    console.error(
      'Gateway operation failed:',
      error instanceof Error ? error.name : 'Unknown error',
    );
    response.status(500).json({ message: 'The gateway could not complete this operation.' });
  }
}
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.use(helmet());
  const sessions = app.get(SessionService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers.origin !== config.origin) {
        res.status(403).json({ message: 'Request origin is not allowed.' });
        return;
      }
      if (req.path !== '/api/auth/login') {
        try {
          const session = sessions.fromRequest(req);
          if (req.headers['x-csrf-token'] !== session.csrf) {
            res
              .status(403)
              .json({ message: 'Session verification failed. Reload and sign in again.' });
            return;
          }
        } catch {
          res.status(401).json({ message: 'Sign in with your ThingsBoard account.' });
          return;
        }
      }
    }
    next();
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.getHttpAdapter().get('/api/health', (_req: Request, res: Response) =>
    res.json({
      status: 'ok',
      thingsboardUrl: config.thingsboardUrl,
      storage: config.databaseUrl ? 'postgres' : 'development-file',
    }),
  );
  await app.init();
  app.get(RealtimeService).attach(app.getHttpServer());
  app.enableShutdownHooks();
  await app.listen(config.port, '127.0.0.1');
  console.log(`Twynix gateway: http://127.0.0.1:${config.port}`);
}
void bootstrap();
