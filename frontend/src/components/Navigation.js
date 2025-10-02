import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context';
import './Navigation.css';

const Navigation = () => {
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setIsMobileMenuOpen(false);
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMobileMenuOpen && !event.target.closest('.navigation__mobile-panel')) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Handle escape key to close mobile menu
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isMobileMenuOpen]);

  const isActiveRoute = (path) => {
    return location.pathname === path;
  };

  if (!isAuthenticated) {
    return (
      <nav className="navigation" role="navigation" aria-label="메인 네비게이션">
        <div className="navigation__container">
          <Link to="/" className="navigation__brand" aria-label="AWS 사용자 관리 홈페이지로 이동">
            <div className="navigation__logo" aria-hidden="true">AWS</div>
            <span>사용자 관리</span>
          </Link>
          
          <div className="navigation__actions" role="group" aria-label="인증 관련 액션">
            <Link 
              to="/login" 
              className="navigation__button navigation__button--secondary"
              aria-label="로그인 페이지로 이동"
            >
              로그인
            </Link>
            <Link 
              to="/register" 
              className="navigation__button navigation__button--primary"
              aria-label="회원가입 페이지로 이동"
            >
              회원가입
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="navigation" role="navigation" aria-label="메인 네비게이션">
      <div className="navigation__container">
        <Link 
          to="/dashboard" 
          className="navigation__brand"
          aria-label="대시보드로 이동"
        >
          <div className="navigation__logo" aria-hidden="true">AWS</div>
          <span>사용자 관리</span>
        </Link>

        {/* Desktop Menu */}
        <ul className="navigation__menu" role="menubar" aria-label="주요 메뉴">
          <li role="none">
            <Link 
              to="/dashboard" 
              className={`navigation__link ${isActiveRoute('/dashboard') ? 'navigation__link--active' : ''}`}
              role="menuitem"
              aria-current={isActiveRoute('/dashboard') ? 'page' : undefined}
              aria-label="대시보드 페이지로 이동"
            >
              대시보드
            </Link>
          </li>
          <li role="none">
            <Link 
              to="/inspection" 
              className={`navigation__link ${isActiveRoute('/inspection') ? 'navigation__link--active' : ''}`}
              role="menuitem"
              aria-current={isActiveRoute('/inspection') ? 'page' : undefined}
              aria-label="리소스 검사 페이지로 이동"
            >
              리소스 검사
            </Link>
          </li>
          <li role="none">
            <Link 
              to="/history" 
              className={`navigation__link ${isActiveRoute('/history') ? 'navigation__link--active' : ''}`}
              role="menuitem"
              aria-current={isActiveRoute('/history') ? 'page' : undefined}
              aria-label="검사 히스토리 페이지로 이동"
            >
              검사 히스토리
            </Link>
          </li>
          {isAdmin() && (
            <li role="none">
              <Link 
                to="/admin" 
                className={`navigation__link ${isActiveRoute('/admin') ? 'navigation__link--active' : ''}`}
                role="menuitem"
                aria-current={isActiveRoute('/admin') ? 'page' : undefined}
                aria-label="관리자 패널 페이지로 이동"
              >
                관리자 패널
              </Link>
            </li>
          )}
        </ul>

        <div className="navigation__actions" role="group" aria-label="사용자 액션">
          <button 
            onClick={handleLogout} 
            className="navigation__button navigation__button--ghost"
            aria-label="로그아웃하기"
            type="button"
          >
            로그아웃
          </button>

          {/* Mobile Menu Toggle */}
          <button
            className={`navigation__mobile-toggle ${isMobileMenuOpen ? 'navigation__mobile-toggle--active' : ''}`}
            onClick={toggleMobileMenu}
            aria-label={isMobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-navigation-menu"
            type="button"
          >
            <div className="navigation__hamburger" aria-hidden="true">
              <span className="navigation__hamburger-line"></span>
              <span className="navigation__hamburger-line"></span>
              <span className="navigation__hamburger-line"></span>
            </div>
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <div 
        className={`navigation__mobile-menu ${isMobileMenuOpen ? 'navigation__mobile-menu--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-menu-title"
        aria-hidden={!isMobileMenuOpen}
      >
        <div className="navigation__mobile-panel" id="mobile-navigation-menu">
          <div className="navigation__mobile-header">
            <div className="navigation__brand">
              <div className="navigation__logo" aria-hidden="true">AWS</div>
              <span id="mobile-menu-title">사용자 관리</span>
            </div>
            <button
              className="navigation__mobile-close"
              onClick={closeMobileMenu}
              aria-label="모바일 메뉴 닫기"
              type="button"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          <nav className="navigation__mobile-nav" role="navigation" aria-label="모바일 메뉴">
            <ul className="list-none" role="menu">
              <li role="none">
                <Link 
                  to="/dashboard" 
                  className={`navigation__mobile-link ${isActiveRoute('/dashboard') ? 'navigation__mobile-link--active' : ''}`}
                  role="menuitem"
                  aria-current={isActiveRoute('/dashboard') ? 'page' : undefined}
                  onClick={closeMobileMenu}
                >
                  대시보드
                </Link>
              </li>
              <li role="none">
                <Link 
                  to="/inspection" 
                  className={`navigation__mobile-link ${isActiveRoute('/inspection') ? 'navigation__mobile-link--active' : ''}`}
                  role="menuitem"
                  aria-current={isActiveRoute('/inspection') ? 'page' : undefined}
                  onClick={closeMobileMenu}
                >
                  리소스 검사
                </Link>
              </li>
              <li role="none">
                <Link 
                  to="/history" 
                  className={`navigation__mobile-link ${isActiveRoute('/history') ? 'navigation__mobile-link--active' : ''}`}
                  role="menuitem"
                  aria-current={isActiveRoute('/history') ? 'page' : undefined}
                  onClick={closeMobileMenu}
                >
                  검사 히스토리
                </Link>
              </li>
              {isAdmin() && (
                <li role="none">
                  <Link 
                    to="/admin" 
                    className={`navigation__mobile-link ${isActiveRoute('/admin') ? 'navigation__mobile-link--active' : ''}`}
                    role="menuitem"
                    aria-current={isActiveRoute('/admin') ? 'page' : undefined}
                    onClick={closeMobileMenu}
                  >
                    관리자 패널
                  </Link>
                </li>
              )}
            </ul>
          </nav>

          <div className="navigation__mobile-divider" role="separator" aria-hidden="true"></div>

          <div className="navigation__mobile-actions" role="group" aria-label="사용자 액션">
            <button 
              onClick={handleLogout} 
              className="navigation__mobile-button navigation__mobile-button--ghost"
              aria-label="로그아웃하기"
              type="button"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;