import React from 'react';
import './Badge.css';

const Badge = ({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  ...props
}) => {
  const baseClass = 'badge';
  const variantClass = `badge--${variant}`;
  const sizeClass = `badge--${size}`;

  const badgeClasses = [
    baseClass,
    variantClass,
    sizeClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <span className={badgeClasses} {...props}>
      {children}
    </span>
  );
};

const BadgeIcon = ({ children, className = '', ...props }) => {
  return (
    <span className={`badge__icon ${className}`} aria-hidden="true" {...props}>
      {children}
    </span>
  );
};

const BadgeText = ({ children, className = '', ...props }) => {
  return (
    <span className={`badge__text ${className}`} {...props}>
      {children}
    </span>
  );
};

const BadgeDot = ({ className = '', ...props }) => {
  return (
    <span className={`badge__dot ${className}`} aria-hidden="true" {...props} />
  );
};

// Attach sub-components to main Badge component
Badge.Icon = BadgeIcon;
Badge.Text = BadgeText;
Badge.Dot = BadgeDot;

export default Badge;