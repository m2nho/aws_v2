import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { authService } from '../services';

// Initial state
const initialState = {
  isAuthenticated: false,
  user: null,
  userRole: null,
  userStatus: null,
  loading: true,
  error: null
};

// Action types
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  UPDATE_USER_STATUS: 'UPDATE_USER_STATUS'
};

// Reducer function
const authReducer = (state, action) => {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload
      };
    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return {
        ...state,
        isAuthenticated: true,
        user: action.payload.user,
        userRole: action.payload.userRole,
        userStatus: action.payload.userStatus,
        loading: false,
        error: null
      };
    case AUTH_ACTIONS.LOGIN_FAILURE:
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        userRole: null,
        userStatus: null,
        loading: false,
        error: action.payload
      };
    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        userRole: null,
        userStatus: null,
        loading: false,
        error: null
      };
    case AUTH_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false
      };
    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null
      };
    case AUTH_ACTIONS.UPDATE_USER_STATUS:
      return {
        ...state,
        userStatus: action.payload
      };
    default:
      return state;
  }
};

// Create context
const AuthContext = createContext();

// AuthProvider component
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check authentication status on app load
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('authToken');
      if (token) {
        try {
          const response = await authService.verifyToken();
          if (response.valid && response.userInfo) {
            dispatch({
              type: AUTH_ACTIONS.LOGIN_SUCCESS,
              payload: {
                user: response.userInfo,
                userRole: response.userInfo.role || 'user',
                userStatus: response.userInfo.status || 'pending'
              }
            });
          } else {
            // Token is invalid, remove it
            localStorage.removeItem('authToken');
            dispatch({ type: AUTH_ACTIONS.LOGOUT });
          }
        } catch (error) {
          console.error('Token verification failed:', error);
          localStorage.removeItem('authToken');
          dispatch({ type: AUTH_ACTIONS.LOGOUT });
        }
      } else {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      }
    };

    checkAuth();
  }, []);

  // Login function
  const login = async (credentials) => {
    console.log('AuthContext: Starting login process');
    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

    try {
      console.log('AuthContext: Calling authService.login');
      const response = await authService.login(credentials);
      console.log('AuthContext: Login response:', response);
      
      if (response.success && response.token) {
        console.log('AuthContext: Login successful, verifying token');
        // Token is already stored in authService.login
        // Verify the token to get user info
        const verifyResponse = await authService.verifyToken();
        console.log('AuthContext: Token verification response:', verifyResponse);
        
        if (verifyResponse.valid && verifyResponse.userInfo) {
          console.log('AuthContext: Token verified, dispatching LOGIN_SUCCESS');
          dispatch({
            type: AUTH_ACTIONS.LOGIN_SUCCESS,
            payload: {
              user: verifyResponse.userInfo,
              userRole: verifyResponse.userInfo.role || 'user',
              userStatus: verifyResponse.userInfo.status || 'pending'
            }
          });
          return { success: true, userStatus: verifyResponse.userInfo.status };
        } else {
          console.error('AuthContext: Token verification failed');
          throw new Error('Failed to verify user information');
        }
      } else {
        console.error('AuthContext: Login failed:', response.message);
        dispatch({
          type: AUTH_ACTIONS.LOGIN_FAILURE,
          payload: response.message || 'Login failed'
        });
        return { success: false, message: response.message };
      }
    } catch (error) {
      console.error('AuthContext: Login error:', error);
      console.error('AuthContext: Error response:', error.response?.data);
      const errorMessage = error.response?.data?.error?.message || error.message || 'Login failed';
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: errorMessage
      });
      return { success: false, message: errorMessage };
    }
  };

  // Register function
  const register = async (userData) => {
    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

    try {
      const response = await authService.register(userData);
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      return response;
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message || 'Registration failed';
      dispatch({
        type: AUTH_ACTIONS.SET_ERROR,
        payload: errorMessage
      });
      return { success: false, message: errorMessage };
    }
  };

  // Logout function
  const logout = () => {
    authService.logout();
    dispatch({ type: AUTH_ACTIONS.LOGOUT });
  };

  // Update user status (for real-time updates)
  const updateUserStatus = (newStatus) => {
    dispatch({
      type: AUTH_ACTIONS.UPDATE_USER_STATUS,
      payload: newStatus
    });
  };

  // Clear error function
  const clearError = () => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
  };

  // Check if user has specific role
  const hasRole = (role) => {
    return state.userRole === role;
  };

  // Check if user is admin
  const isAdmin = () => {
    return state.userRole === 'admin';
  };

  // Check if user is approved
  const isApproved = () => {
    return state.userStatus === 'approved' || state.userStatus === 'active';
  };

  const value = {
    // State
    ...state,
    
    // Actions
    login,
    register,
    logout,
    updateUserStatus,
    clearError,
    
    // Utility functions
    hasRole,
    isAdmin,
    isApproved
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;