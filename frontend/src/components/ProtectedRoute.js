import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context';

// Component to protect routes that require authentication
export const ProtectedRoute = ({ children, requireAdmin = false, requireApproved = false }) => {
  const { isAuthenticated, isAdmin, isApproved, loading } = useAuth();

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="loading-container">
        <div>Loading...</div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check admin requirement
  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }

  // Check approval requirement
  if (requireApproved && !isApproved()) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// Component to redirect authenticated users away from auth pages
export const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="loading-container">
        <div>Loading...</div>
      </div>
    );
  }

  // Redirect to dashboard if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};