// ============================================================
// API Client / BFF wrapper for Push2Prod Frontend
// Sabhi services ko direct ports par hit karne ke bajay
// hum API Gateway (BFF) ko port 4000 par hit karenge.
// ============================================================

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Browser runtime: use the current page's hostname so it works
    // on both AWS EC2 (98.93.56.187) and local dev without hardcoding.
    if (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes('localhost')) {
      return process.env.NEXT_PUBLIC_API_URL.endsWith('/api') 
        ? process.env.NEXT_PUBLIC_API_URL 
        : `${process.env.NEXT_PUBLIC_API_URL}/api`;
    }
    return `${window.location.protocol}//${window.location.hostname}:4000/api`;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
}

export async function fetchApi(path: string, options: RequestInit = {}) {
  const baseUrl = getApiBaseUrl();
  const url = path.startsWith('http') ? path : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  
  const headers = new Headers(options.headers);
  
  // CORS request me authorization session cookie (authjs.session-token) pass karne ke liye
  // credentials: 'include' option lagana anivarya (crucial) hai
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
  
  return res;
}
