import { useEffect, useCallback } from 'react';
import { authService } from '../services';

// Custom hook for managing authentication tokens
export const useTokenManager = (dispatch, AUTH_ACTIONS) => {
  // Get token from localStorage
  const getToken = useCallback(() => {
    return localStorage.getItem('authToken');
  }, []);

  // Set token in localStorage
  const setToken = useCallback((token) => {
    if (token) {
      localStorage.setItem('authToken', token);
    } else {
      localStorage.removeItem('authToken');
    }
  }, []);

  // Remove token from localStorage
  const removeToken = useCallback(() => {
    localStorage.removeItem('authToken');
  }, []);

  // Check if token exists
  const hasToken = useCallback(() => {
    return !!getToken();
  }, [getToken]);

  // Verify token validity
  const verifyToken = useCallback(async () => {
    const token = getToken();
    if (!token) {
      return { valid: false, error: 'No token found' };
    }

    try {
      const response = await authService.verifyToken();
      return response;
    } catch (error) {
      console.error('Token verification failed:', error);
      return { valid: false, error: error.message };
    }
  }, [getToken]);

  // Auto-refresh token periodically (optional feature for future enhancement)
  const setupTokenRefresh = useCallback(() => {
    // This could be implemented later if the backend supports token refresh
    // For now, we'll just verify the token periodically
    const interval = setInterval(async () => {
      if (hasToken()) {
        const result = await verifyToken();
        if (!result.valid) {
          removeToken();
          dispatch({ type: AUTH_ACTIONS.LOGOUT });
        }
      }
    }, 15 * 60 * 1000); // Check every 15 minutes

    return () => clearInterval(interval);
  }, [hasToken, verifyToken, removeToken, dispatch, AUTH_ACTIONS.LOGOUT]);

  // Setup token refresh on mount
  useEffect(() => {
    const cleanup = setupTokenRefresh();
    return cleanup;
  }, [setupTokenRefresh]);

  // Handle token expiration
  const handleTokenExpiration = useCallback(() => {
    removeToken();
    dispatch({ type: AUTH_ACTIONS.LOGOUT });
  }, [removeToken, dispatch, AUTH_ACTIONS.LOGOUT]);

  return {
    getToken,
    setToken,
    removeToken,
    hasToken,
    verifyToken,
    handleTokenExpiration
  };
};