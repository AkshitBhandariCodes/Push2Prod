import dotenv from 'dotenv';
import path from 'path';

// dotenv config ko load karega root folder se, kyunki apps/services monorepo ke andar run honge
// __dirname ka matlab is file ki location, wahan se 3 level upar root .env hai
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Yahan par hum saare environment variables ko ek jagah export kar rahe hain.
// Isse process.env har jagah likhna nahi padega, aur types ka fayda milega.
export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/prod2push',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  projectServicePort: parseInt(process.env.PROJECT_SERVICE_PORT || '4001', 10),
  apiGatewayPort: parseInt(process.env.API_GATEWAY_PORT || '4000', 10),
  webAppUrl: process.env.WEB_APP_URL || 'http://localhost:3000',
  projectServiceUrl: process.env.PROJECT_SERVICE_URL || 'http://localhost:4001',
  
  // Example for environment check
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // S3 Object Storage Config
  s3: {
    endpoint: process.env.S3_ENDPOINT && process.env.S3_ENDPOINT.trim() !== '' ? process.env.S3_ENDPOINT : undefined,
    region: process.env.S3_REGION || 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY || process.env.S3_ACCESS_KEY_ID || undefined,
    secretAccessKey: process.env.S3_SECRET_KEY || process.env.S3_SECRET_ACCESS_KEY || undefined,
    bucketName: process.env.S3_BUCKET_NAME || 'push2prod-artifacts',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
};
