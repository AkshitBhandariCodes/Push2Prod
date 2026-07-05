// Ye ek simple logger function hai jo alag-alag level ki logs print karega.
// Production mein hum pino ya winston jaise libraries use karte hain, par foundation ke liye ye best hai.

export const logger = {
  // Normal information logs ke liye
  info: (message: string, meta?: any) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta ? meta : '');
  },
  
  // Warning logs ke liye (jab kuch ajeeb ho par application crash na ho)
  warn: (message: string, meta?: any) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta ? meta : '');
  },

  // Error logs ke liye (jab kuch phat jaye)
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error ? error : '');
  },
  
  // Debug logs ke liye (sirf development mein kaam aate hain)
  debug: (message: string, meta?: any) => {
    console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, meta ? meta : '');
  }
};
