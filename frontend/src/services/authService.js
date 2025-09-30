import api from './api';

export const authService = {
  // Register new user
  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  // Login user
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    if (response.data.success && response.data.token) {
      localStorage.setItem('authToken', response.data.token);
    }
    return response.data;
  },

  // Verify token
  verifyToken: async () => {
    const response = await api.get('/auth/verify');
    return response.data;
  },

  // Logout user
  logout: () => {
    localStorage.removeItem('authToken');
  }
};