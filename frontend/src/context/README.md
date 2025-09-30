# Authentication Context

This directory contains the authentication context and related utilities for managing user authentication state throughout the application.

## AuthContext

The `AuthContext` provides centralized authentication state management using React Context and useReducer.

### Features

- **Centralized State Management**: All authentication state is managed in one place
- **Automatic Token Handling**: Automatically checks for existing tokens on app load
- **Token Persistence**: Stores authentication tokens in localStorage
- **Role-based Access Control**: Provides utility functions for checking user roles
- **Error Handling**: Comprehensive error handling for authentication operations

### Usage

#### 1. Wrap your app with AuthProvider

```jsx
import { AuthProvider } from './context';

function App() {
  return (
    <AuthProvider>
      <YourAppComponents />
    </AuthProvider>
  );
}
```

#### 2. Use the useAuth hook in components

```jsx
import { useAuth } from './context';

function MyComponent() {
  const { 
    isAuthenticated, 
    user, 
    userRole, 
    userStatus,
    loading, 
    error,
    login, 
    logout,
    register,
    isAdmin,
    isApproved 
  } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {isAuthenticated ? (
        <div>
          <p>Welcome, {user.username}!</p>
          <p>Status: {userStatus}</p>
          {isAdmin() && <p>You are an admin</p>}
          <button onClick={logout}>Logout</button>
        </div>
      ) : (
        <div>Please log in</div>
      )}
    </div>
  );
}
```

### State Properties

- `isAuthenticated`: Boolean indicating if user is logged in
- `user`: User object containing user information
- `userRole`: Current user's role ('user', 'admin', etc.)
- `userStatus`: Current user's status ('pending', 'approved', 'rejected')
- `loading`: Boolean indicating if authentication check is in progress
- `error`: String containing any authentication error message

### Actions

- `login(credentials)`: Authenticate user with username/password
- `register(userData)`: Register new user
- `logout()`: Log out current user
- `updateUserStatus(newStatus)`: Update user status (for real-time updates)
- `clearError()`: Clear current error message

### Utility Functions

- `hasRole(role)`: Check if user has specific role
- `isAdmin()`: Check if user is admin
- `isApproved()`: Check if user is approved/active

## ProtectedRoute Components

The `ProtectedRoute` components help protect routes based on authentication and authorization.

### Usage

```jsx
import { ProtectedRoute, PublicRoute } from './components';

// Protect routes that require authentication
<ProtectedRoute>
  <Dashboard />
</ProtectedRoute>

// Protect routes that require admin access
<ProtectedRoute requireAdmin={true}>
  <AdminPanel />
</ProtectedRoute>

// Protect routes that require approved status
<ProtectedRoute requireApproved={true}>
  <UserFeatures />
</ProtectedRoute>

// Redirect authenticated users away from login/register
<PublicRoute>
  <LoginForm />
</PublicRoute>
```

## Token Management

The authentication system automatically handles:

- Token storage in localStorage
- Token verification on app load
- Token removal on logout or expiration
- Automatic redirect on token expiration

## Requirements Satisfied

This implementation satisfies the following requirements:

- **4.1**: User login with AWS Cognito authentication
- **4.2**: User status checking and display
- **Token Storage**: Automatic token persistence and retrieval
- **Auto-login**: Automatic authentication check on app load