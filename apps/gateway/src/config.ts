import 'dotenv/config';
import { z } from 'zod';
const env = z
  .object({
    THINGSBOARD_URL: z.url().default('http://192.168.1.148:8080'),
    APP_ORIGIN: z.url().default('http://127.0.0.1:4200'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
    ENABLE_DEVICE_COMMANDS: z.enum(['true', 'false']).default('false'),
    DATABASE_URL: z.string().optional(),
    PROJECT_DATA_DIR: z.string().default('.data'),
  })
  .parse(process.env);
export const config = {
  thingsboardUrl: env.THINGSBOARD_URL.replace(/\/$/, ''),
  origin: new URL(env.APP_ORIGIN).origin,
  port: env.PORT,
  secureCookie: env.COOKIE_SECURE === 'true',
  commandsEnabled: env.ENABLE_DEVICE_COMMANDS === 'true',
  databaseUrl: env.DATABASE_URL,
  dataDir: env.PROJECT_DATA_DIR,
};
