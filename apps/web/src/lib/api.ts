// ============================================================
// API Client / BFF wrapper for Push2Prod Frontend
// Sabhi services ko direct ports par hit karne ke bajay
// hum API Gateway (BFF) ko port 4000 par hit karenge.
// ============================================================

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export async function fetchApi(path: string, options: RequestInit = {}) {
  // Agar path absolute hai (jaise real URLs), to direct call karo, nahi to Gateway url prepend karo
  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  
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
