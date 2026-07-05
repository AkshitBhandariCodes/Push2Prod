import dotenv from 'dotenv';
import path from 'path';

// dotenv config ko load karega root folder se, kyunki apps/services monorepo ke andar run honge
// __dirname ka matlab is file ki location, wahan se 3 level upar root .env hai
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Yahan par hum saare environment variables ko ek jagah export kar rahe hain.
// Isse process.env har jagah likhna nahi padega, aur types ka fayda milega.
export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vercel_pro',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  projectServicePort: parseInt(process.env.PROJECT_SERVICE_PORT || '4001', 10),
  
  // Example for environment check
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
};
