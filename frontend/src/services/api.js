import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle different types of errors
    if (error.response?.status === 401) {
      // Clear token on unauthorized
      localStorage.removeItem('authToken');
      
      // Only redirect if not already on login/register page
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/register') {
        window.location.href = '/login';
      }
    } else if (error.response?.status === 403) {
      // Handle forbidden access
      console.warn('Access forbidden:', error.response.data);
    } else if (error.response?.status >= 500) {
      // Handle server errors
      console.error('Server error:', error.response.data);
    } else if (error.code === 'ECONNABORTED') {
      // Handle timeout
      console.error('Request timeout');
    } else if (!error.response) {
      // Handle network errors
      console.error('Network error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

export default api;