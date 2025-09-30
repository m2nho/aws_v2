import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ 
  size = 'md', 
  variant = 'primary', 
  className = '',
  text = null 
}) => {
  const spinnerClasses = [
    'loading-spinner',
    `loading-spinner--${size}`,
    `loading-spinner--${variant}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className="loading-spinner-container">
      <div className={spinnerClasses}>
        <div className="loading-spinner__circle"></div>
      </div>
      {text && <span className="loading-spinner__text">{text}</span>}
    </div>
  );
};

// 스켈레톤 UI 컴포넌트
const SkeletonLoader = ({ 
  variant = 'text', 
  width = '100%', 
  height = null,
  className = '',
  lines = 1 
}) => {
  const skeletonClasses = [
    'skeleton-loader',
    `skeleton-loader--${variant}`,
    className
  ].filter(Boolean).join(' ');

  const style = {
    width,
    ...(height && { height })
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div className="skeleton-loader-group">
        {Array.from({ length: lines }, (_, index) => (
          <div 
            key={index}
            className={skeletonClasses}
            style={{
              ...style,
              width: index === lines - 1 ? '75%' : width // 마지막 줄은 75% 너비
            }}
          />
        ))}
      </div>
    );
  }

  return <div className={skeletonClasses} style={style} />;
};

// 카드 스켈레톤 컴포넌트
const CardSkeleton = ({ className = '' }) => {
  return (
    <div className={`card-skeleton ${className}`}>
      <div className="card-skeleton__header">
        <SkeletonLoader variant="circle" width="40px" height="40px" />
        <div className="card-skeleton__title">
          <SkeletonLoader variant="text" width="60%" height="16px" />
          <SkeletonLoader variant="text" width="40%" height="12px" />
        </div>
      </div>
      <div className="card-skeleton__content">
        <SkeletonLoader variant="text" lines={3} />
      </div>
      <div className="card-skeleton__footer">
        <SkeletonLoader variant="button" width="80px" height="32px" />
        <SkeletonLoader variant="button" width="100px" height="32px" />
      </div>
    </div>
  );
};

// 테이블 스켈레톤 컴포넌트
const TableSkeleton = ({ rows = 5, columns = 4, className = '' }) => {
  return (
    <div className={`table-skeleton ${className}`}>
      <div className="table-skeleton__header">
        {Array.from({ length: columns }, (_, index) => (
          <SkeletonLoader 
            key={index}
            variant="text" 
            width="80%" 
            height="16px" 
          />
        ))}
      </div>
      <div className="table-skeleton__body">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={rowIndex} className="table-skeleton__row">
            {Array.from({ length: columns }, (_, colIndex) => (
              <SkeletonLoader 
                key={colIndex}
                variant="text" 
                width="90%" 
                height="14px" 
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LoadingSpinner;
export { SkeletonLoader, CardSkeleton, TableSkeleton };