import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  headers: {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.params = { ...config.params, _t: Date.now() };
  return config;
});

// A 401 from these endpoints is an expected "wrong credentials / wrong code"
// response that the page shows inline — it must NOT trigger an auto-logout
// redirect (that was bouncing a wrong OTP back to the email/password screen).
// A 401 from any other (data) request still means the session is dead → log out.
const AUTH_ENDPOINTS = ['/auth/login', '/auth/verify-otp', '/auth/resend-otp', '/auth/change-password'];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthCall = AUTH_ENDPOINTS.some((p) => url.includes(p));
    if (error.response?.status === 401 && !isAuthCall) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;