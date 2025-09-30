import api from './api';

export const adminService = {
  // Get all users (admin only)
  getAllUsers: async () => {
    const response = await api.get('/admin/users');
    return response.data;
  },

  // Update user status (admin only)
  updateUserStatus: async (userId, status) => {
    const response = await api.put(`/admin/users/${userId}/status`, { status });
    return response.data;
  },

  // Validate user's AWS Role ARN (admin only)
  validateUserArn: async (userId) => {
    const response = await api.post(`/admin/users/${userId}/validate-arn`);
    return response.data;
  }
};