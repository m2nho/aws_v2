import React from 'react';
import './Card.css';

const Card = ({ 
  children, 
  className = '', 
  hover = false,
  padding = 'md',
  ...props 
}) => {
  const baseClass = 'card';
  const hoverClass = hover ? 'card--hover' : '';
  const paddingClass = `card--padding-${padding}`;

  const cardClasses = [
    baseClass,
    hoverClass,
    paddingClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses} {...props}>
      {children}
    </div>
  );
};

const CardHeader = ({ children, className = '', ...props }) => {
  return (
    <div className={`card__header ${className}`} {...props}>
      {children}
    </div>
  );
};

const CardTitle = ({ children, className = '', as: Component = 'h3', ...props }) => {
  return (
    <Component className={`card__title ${className}`} {...props}>
      {children}
    </Component>
  );
};

const CardSubtitle = ({ children, className = '', ...props }) => {
  return (
    <div className={`card__subtitle ${className}`} {...props}>
      {children}
    </div>
  );
};

const CardContent = ({ children, className = '', ...props }) => {
  return (
    <div className={`card__content ${className}`} {...props}>
      {children}
    </div>
  );
};

const CardFooter = ({ children, className = '', ...props }) => {
  return (
    <div className={`card__footer ${className}`} {...props}>
      {children}
    </div>
  );
};

const CardActions = ({ children, className = '', align = 'right', ...props }) => {
  const alignClass = `card__actions--${align}`;
  
  return (
    <div className={`card__actions ${alignClass} ${className}`} {...props}>
      {children}
    </div>
  );
};

// Attach sub-components to main Card component
Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Subtitle = CardSubtitle;
Card.Content = CardContent;
Card.Footer = CardFooter;
Card.Actions = CardActions;

export default Card;