import React, { useState, forwardRef } from 'react';
import './Input.css';

const Input = forwardRef(({
  label,
  hint,
  error,
  type = 'text',
  size = 'md',
  disabled = false,
  required = false,
  className = '',
  id,
  name,
  placeholder,
  value,
  defaultValue,
  onChange,
  onFocus,
  onBlur,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Generate unique ID if not provided
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  
  // Determine input type for password toggle
  const inputType = type === 'password' && showPassword ? 'text' : type;
  
  // Build class names
  const containerClass = [
    'input-container',
    `input-container--${size}`,
    disabled ? 'input-container--disabled' : '',
    error ? 'input-container--error' : '',
    isFocused ? 'input-container--focused' : '',
    className
  ].filter(Boolean).join(' ');

  const inputClass = [
    'input',
    `input--${size}`,
    type === 'password' ? 'input--password' : '',
    error ? 'input--error' : '',
    disabled ? 'input--disabled' : ''
  ].filter(Boolean).join(' ');

  const handleFocus = (e) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className={containerClass}>
      {label && (
        <label htmlFor={inputId} className="input-label">
          {label}
          {required && <span className="input-label__required" aria-label="필수">*</span>}
        </label>
      )}
      
      <div className="input-wrapper">
        <input
          ref={ref}
          id={inputId}
          name={name}
          type={inputType}
          className={inputClass}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          required={required}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? 'true' : 'false'}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={onChange}
          {...props}
        />
        
        {type === 'password' && (
          <button
            type="button"
            className="input-password-toggle"
            onClick={togglePasswordVisibility}
            aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            tabIndex={disabled ? -1 : 0}
          >
            {showPassword ? (
              <svg className="input-password-toggle__icon" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 11-4.243-4.243m4.242 4.242L9.88 9.88"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg className="input-password-toggle__icon" viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        )}
      </div>
      
      {hint && !error && (
        <div id={hintId} className="input-hint">
          {hint}
        </div>
      )}
      
      {error && (
        <div id={errorId} className="input-error" role="alert">
          <svg className="input-error__icon" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;