/**
 * Integration Test and Verification Script
 * Tests all components and pages for new design system implementation
 */

// Test configuration
const TEST_CONFIG = {
  // Breakpoints to test
  breakpoints: [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'large', width: 1920, height: 1080 }
  ],
  
  // Components to test
  components: [
    'LoginForm',
    'RegisterForm', 
    'UserDashboard',
    'UserList',
    'Navigation',
    'Button',
    'Card',
    'Input',
    'Badge',
    'LoadingSpinner',
    'Toast'
  ],
  
  // Pages to test
  pages: [
    '/login',
    '/register', 
    '/dashboard',
    '/admin'
  ],
  
  // Accessibility tests
  a11yTests: [
    'focusManagement',
    'keyboardNavigation',
    'colorContrast',
    'ariaLabels',
    'semanticHTML'
  ]
};

/**
 * Visual Regression Test Suite
 */
class VisualRegressionTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
  }

  /**
   * Test component rendering across breakpoints
   */
  async testResponsiveRendering() {
    console.log('🔍 Testing responsive rendering...');
    
    for (const component of TEST_CONFIG.components) {
      for (const breakpoint of TEST_CONFIG.breakpoints) {
        try {
          const result = await this.testComponentAtBreakpoint(component, breakpoint);
          this.recordResult(result);
        } catch (error) {
          this.recordError(`${component} at ${breakpoint.name}`, error);
        }
      }
    }
  }

  /**
   * Test individual component at specific breakpoint
   */
  async testComponentAtBreakpoint(component, breakpoint) {
    // Simulate viewport resize
    if (typeof window !== 'undefined') {
      // Browser environment
      window.innerWidth = breakpoint.width;
      window.innerHeight = breakpoint.height;
      window.dispatchEvent(new Event('resize'));
    }

    const testResult = {
      component,
      breakpoint: breakpoint.name,
      passed: true,
      issues: []
    };

    // Test component-specific requirements
    switch (component) {
      case 'LoginForm':
        testResult.issues = await this.testLoginForm(breakpoint);
        break;
      case 'RegisterForm':
        testResult.issues = await this.testRegisterForm(breakpoint);
        break;
      case 'UserDashboard':
        testResult.issues = await this.testUserDashboard(breakpoint);
        break;
      case 'UserList':
        testResult.issues = await this.testUserList(breakpoint);
        break;
      case 'Navigation':
        testResult.issues = await this.testNavigation(breakpoint);
        break;
      default:
        testResult.issues = await this.testGenericComponent(component, breakpoint);
    }

    testResult.passed = testResult.issues.length === 0;
    return testResult;
  }

  /**
   * Test LoginForm component
   */
  async testLoginForm(breakpoint) {
    const issues = [];
    
    // Test form layout
    const form = document.querySelector('.login-form');
    if (!form) {
      issues.push('LoginForm not found in DOM');
      return issues;
    }

    // Test responsive layout
    if (breakpoint.width < 768) {
      // Mobile: should be full width
      const computedStyle = window.getComputedStyle(form);
      if (computedStyle.maxWidth !== 'none' && parseInt(computedStyle.maxWidth) > breakpoint.width) {
        issues.push('LoginForm not responsive on mobile');
      }
    }

    // Test button layout
    const buttons = form.querySelectorAll('.btn');
    if (breakpoint.width < 768) {
      // Mobile: buttons should stack vertically
      const formActions = form.querySelector('.form-actions');
      if (formActions) {
        const computedStyle = window.getComputedStyle(formActions);
        if (computedStyle.flexDirection !== 'column-reverse') {
          issues.push('LoginForm buttons not stacking on mobile');
        }
      }
    }

    // Test input field sizing
    const inputs = form.querySelectorAll('input');
    inputs.forEach((input, index) => {
      const computedStyle = window.getComputedStyle(input);
      const minHeight = parseInt(computedStyle.minHeight);
      
      if (breakpoint.width < 768 && minHeight < 44) {
        issues.push(`Input ${index} touch target too small on mobile`);
      }
    });

    return issues;
  }

  /**
   * Test RegisterForm component
   */
  async testRegisterForm(breakpoint) {
    const issues = [];
    
    const form = document.querySelector('.register-form');
    if (!form) {
      issues.push('RegisterForm not found in DOM');
      return issues;
    }

    // Test multi-step form layout
    const steps = form.querySelectorAll('.form-step');
    if (steps.length === 0) {
      issues.push('RegisterForm steps not found');
    }

    // Test progress indicator
    const progressIndicator = form.querySelector('.progress-indicator');
    if (!progressIndicator) {
      issues.push('RegisterForm progress indicator missing');
    }

    return issues;
  }

  /**
   * Test UserDashboard component
   */
  async testUserDashboard(breakpoint) {
    const issues = [];
    
    const dashboard = document.querySelector('.user-dashboard');
    if (!dashboard) {
      issues.push('UserDashboard not found in DOM');
      return issues;
    }

    // Test card layout
    const cards = dashboard.querySelectorAll('.dashboard-card');
    if (cards.length === 0) {
      issues.push('Dashboard cards not found');
      return issues;
    }

    // Test responsive grid
    const content = dashboard.querySelector('.dashboard-content');
    if (content) {
      const computedStyle = window.getComputedStyle(content);
      
      if (breakpoint.width < 768) {
        // Mobile: should be single column
        if (computedStyle.gridTemplateColumns !== '1fr') {
          issues.push('Dashboard not single column on mobile');
        }
      } else if (breakpoint.width >= 1024) {
        // Desktop: should be multi-column
        if (!computedStyle.gridTemplateColumns.includes('1fr')) {
          issues.push('Dashboard not multi-column on desktop');
        }
      }
    }

    return issues;
  }

  /**
   * Test UserList component
   */
  async testUserList(breakpoint) {
    const issues = [];
    
    const userList = document.querySelector('.user-list');
    if (!userList) {
      issues.push('UserList not found in DOM');
      return issues;
    }

    // Test responsive table/card layout
    if (breakpoint.width < 768) {
      // Mobile: should show cards
      const cards = userList.querySelectorAll('.user-card');
      const table = userList.querySelector('.user-table');
      
      if (cards.length === 0 && table && window.getComputedStyle(table).display !== 'none') {
        issues.push('UserList not showing cards on mobile');
      }
    } else {
      // Desktop: should show table
      const table = userList.querySelector('.user-table');
      if (!table || window.getComputedStyle(table).display === 'none') {
        issues.push('UserList not showing table on desktop');
      }
    }

    return issues;
  }

  /**
   * Test Navigation component
   */
  async testNavigation(breakpoint) {
    const issues = [];
    
    const nav = document.querySelector('.navigation');
    if (!nav) {
      issues.push('Navigation not found in DOM');
      return issues;
    }

    if (breakpoint.width < 768) {
      // Mobile: should show hamburger menu
      const hamburger = nav.querySelector('.navigation__mobile-toggle');
      if (!hamburger) {
        issues.push('Mobile hamburger menu not found');
      }
      
      // Desktop menu should be hidden
      const desktopMenu = nav.querySelector('.navigation__menu');
      if (desktopMenu && window.getComputedStyle(desktopMenu).display !== 'none') {
        issues.push('Desktop menu visible on mobile');
      }
    } else {
      // Desktop: should show full menu
      const desktopMenu = nav.querySelector('.navigation__menu');
      if (!desktopMenu || window.getComputedStyle(desktopMenu).display === 'none') {
        issues.push('Desktop menu not visible on desktop');
      }
    }

    return issues;
  }

  /**
   * Test generic component
   */
  async testGenericComponent(component, breakpoint) {
    const issues = [];
    
    // Test basic component existence
    const element = document.querySelector(`.${component.toLowerCase()}`);
    if (!element) {
      issues.push(`${component} not found in DOM`);
      return issues;
    }

    // Test basic responsive behavior
    const computedStyle = window.getComputedStyle(element);
    
    // Check for overflow issues
    if (parseInt(computedStyle.width) > breakpoint.width) {
      issues.push(`${component} overflows viewport at ${breakpoint.name}`);
    }

    return issues;
  }

  /**
   * Record test result
   */
  recordResult(result) {
    if (result.passed) {
      this.results.passed++;
    } else {
      this.results.failed++;
    }
    
    this.results.details.push(result);
  }

  /**
   * Record test error
   */
  recordError(testName, error) {
    this.results.failed++;
    this.results.details.push({
      test: testName,
      passed: false,
      error: error.message
    });
  }

  /**
   * Generate test report
   */
  generateReport() {
    const total = this.results.passed + this.results.failed;
    const passRate = total > 0 ? (this.results.passed / total * 100).toFixed(1) : 0;
    
    console.log('\n📊 Visual Regression Test Results');
    console.log('=====================================');
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`⚠️  Warnings: ${this.results.warnings}`);
    console.log(`📈 Pass Rate: ${passRate}%`);
    
    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.details
        .filter(result => !result.passed)
        .forEach(result => {
          console.log(`  - ${result.component || result.test} at ${result.breakpoint || 'unknown'}`);
          if (result.issues) {
            result.issues.forEach(issue => console.log(`    • ${issue}`));
          }
          if (result.error) {
            console.log(`    • Error: ${result.error}`);
          }
        });
    }
    
    return this.results;
  }
}

/**
 * Accessibility Test Suite
 */
class AccessibilityTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
  }

  /**
   * Run all accessibility tests
   */
  async runAllTests() {
    console.log('♿ Testing accessibility features...');
    
    await this.testFocusManagement();
    await this.testKeyboardNavigation();
    await this.testColorContrast();
    await this.testAriaLabels();
    await this.testSemanticHTML();
    
    return this.generateReport();
  }

  /**
   * Test focus management
   */
  async testFocusManagement() {
    const issues = [];
    
    // Test focus indicators
    const focusableElements = document.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    focusableElements.forEach((element, index) => {
      element.focus();
      const computedStyle = window.getComputedStyle(element, ':focus-visible');
      
      if (!computedStyle.outline || computedStyle.outline === 'none') {
        issues.push(`Element ${index} missing focus indicator`);
      }
    });

    this.recordResult('Focus Management', issues);
  }

  /**
   * Test keyboard navigation
   */
  async testKeyboardNavigation() {
    const issues = [];
    
    // Test tab order
    const focusableElements = document.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length === 0) {
      issues.push('No focusable elements found');
    }

    // Test skip links
    const skipLinks = document.querySelectorAll('.skip-link, .skip-to-main');
    if (skipLinks.length === 0) {
      issues.push('Skip to main content link missing');
    }

    this.recordResult('Keyboard Navigation', issues);
  }

  /**
   * Test color contrast
   */
  async testColorContrast() {
    const issues = [];
    
    // Test text elements for contrast
    const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div, label, button');
    
    textElements.forEach((element, index) => {
      const computedStyle = window.getComputedStyle(element);
      const color = computedStyle.color;
      const backgroundColor = computedStyle.backgroundColor;
      
      // Basic check - more sophisticated contrast checking would require color parsing
      if (color === backgroundColor) {
        issues.push(`Element ${index} has same text and background color`);
      }
    });

    this.recordResult('Color Contrast', issues);
  }

  /**
   * Test ARIA labels
   */
  async testAriaLabels() {
    const issues = [];
    
    // Test buttons without text content
    const buttons = document.querySelectorAll('button');
    buttons.forEach((button, index) => {
      const hasText = button.textContent.trim().length > 0;
      const hasAriaLabel = button.hasAttribute('aria-label');
      const hasAriaLabelledBy = button.hasAttribute('aria-labelledby');
      
      if (!hasText && !hasAriaLabel && !hasAriaLabelledBy) {
        issues.push(`Button ${index} missing accessible name`);
      }
    });

    // Test form inputs
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach((input, index) => {
      const hasLabel = document.querySelector(`label[for="${input.id}"]`);
      const hasAriaLabel = input.hasAttribute('aria-label');
      const hasAriaLabelledBy = input.hasAttribute('aria-labelledby');
      
      if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy) {
        issues.push(`Input ${index} missing accessible label`);
      }
    });

    this.recordResult('ARIA Labels', issues);
  }

  /**
   * Test semantic HTML
   */
  async testSemanticHTML() {
    const issues = [];
    
    // Test heading hierarchy
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let previousLevel = 0;
    
    headings.forEach((heading, index) => {
      const currentLevel = parseInt(heading.tagName.charAt(1));
      
      if (index === 0 && currentLevel !== 1) {
        issues.push('Page should start with h1');
      }
      
      if (currentLevel > previousLevel + 1) {
        issues.push(`Heading level skipped at heading ${index}`);
      }
      
      previousLevel = currentLevel;
    });

    // Test landmark roles
    const main = document.querySelector('main');
    if (!main) {
      issues.push('Main landmark missing');
    }

    const nav = document.querySelector('nav');
    if (!nav) {
      issues.push('Navigation landmark missing');
    }

    this.recordResult('Semantic HTML', issues);
  }

  /**
   * Record test result
   */
  recordResult(testName, issues) {
    const result = {
      test: testName,
      passed: issues.length === 0,
      issues
    };
    
    if (result.passed) {
      this.results.passed++;
    } else {
      this.results.failed++;
    }
    
    this.results.details.push(result);
  }

  /**
   * Generate accessibility report
   */
  generateReport() {
    const total = this.results.passed + this.results.failed;
    const passRate = total > 0 ? (this.results.passed / total * 100).toFixed(1) : 0;
    
    console.log('\n♿ Accessibility Test Results');
    console.log('==============================');
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Pass Rate: ${passRate}%`);
    
    if (this.results.failed > 0) {
      console.log('\n❌ Failed Accessibility Tests:');
      this.results.details
        .filter(result => !result.passed)
        .forEach(result => {
          console.log(`  - ${result.test}`);
          result.issues.forEach(issue => console.log(`    • ${issue}`));
        });
    }
    
    return this.results;
  }
}

/**
 * Performance Test Suite
 */
class PerformanceTester {
  constructor() {
    this.results = {
      metrics: {},
      passed: 0,
      failed: 0
    };
  }

  /**
   * Run performance tests
   */
  async runPerformanceTests() {
    console.log('⚡ Testing performance metrics...');
    
    await this.testCSSLoadTime();
    await this.testRenderPerformance();
    await this.testMemoryUsage();
    
    return this.generateReport();
  }

  /**
   * Test CSS load time
   */
  async testCSSLoadTime() {
    if (typeof performance !== 'undefined') {
      const cssResources = performance.getEntriesByType('resource')
        .filter(entry => entry.name.includes('.css'));
      
      const totalCSSTime = cssResources.reduce((total, entry) => {
        return total + (entry.responseEnd - entry.startTime);
      }, 0);
      
      this.results.metrics.cssLoadTime = totalCSSTime;
      
      // Pass if CSS loads in under 500ms
      if (totalCSSTime < 500) {
        this.results.passed++;
      } else {
        this.results.failed++;
      }
    }
  }

  /**
   * Test render performance
   */
  async testRenderPerformance() {
    if (typeof performance !== 'undefined') {
      const paintEntries = performance.getEntriesByType('paint');
      const fcp = paintEntries.find(entry => entry.name === 'first-contentful-paint');
      
      if (fcp) {
        this.results.metrics.firstContentfulPaint = fcp.startTime;
        
        // Pass if FCP is under 2 seconds
        if (fcp.startTime < 2000) {
          this.results.passed++;
        } else {
          this.results.failed++;
        }
      }
    }
  }

  /**
   * Test memory usage
   */
  async testMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      this.results.metrics.memoryUsage = {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      };
      
      // Pass if memory usage is reasonable
      const usageRatio = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
      if (usageRatio < 0.5) {
        this.results.passed++;
      } else {
        this.results.failed++;
      }
    }
  }

  /**
   * Generate performance report
   */
  generateReport() {
    console.log('\n⚡ Performance Test Results');
    console.log('============================');
    
    if (this.results.metrics.cssLoadTime) {
      console.log(`CSS Load Time: ${this.results.metrics.cssLoadTime.toFixed(2)}ms`);
    }
    
    if (this.results.metrics.firstContentfulPaint) {
      console.log(`First Contentful Paint: ${this.results.metrics.firstContentfulPaint.toFixed(2)}ms`);
    }
    
    if (this.results.metrics.memoryUsage) {
      const usage = this.results.metrics.memoryUsage;
      console.log(`Memory Usage: ${(usage.used / 1024 / 1024).toFixed(2)}MB / ${(usage.total / 1024 / 1024).toFixed(2)}MB`);
    }
    
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    
    return this.results;
  }
}

/**
 * Main test runner
 */
class IntegrationTestRunner {
  constructor() {
    this.visualTester = new VisualRegressionTester();
    this.accessibilityTester = new AccessibilityTester();
    this.performanceTester = new PerformanceTester();
  }

  /**
   * Run all integration tests
   */
  async runAllTests() {
    console.log('🚀 Starting Integration Tests...\n');
    
    const results = {
      visual: await this.visualTester.testResponsiveRendering(),
      accessibility: await this.accessibilityTester.runAllTests(),
      performance: await this.performanceTester.runPerformanceTests()
    };

    // Generate final report
    this.generateFinalReport(results);
    
    return results;
  }

  /**
   * Generate final comprehensive report
   */
  generateFinalReport(results) {
    console.log('\n🎯 Final Integration Test Report');
    console.log('==================================');
    
    const totalTests = 
      (this.visualTester.results.passed + this.visualTester.results.failed) +
      (this.accessibilityTester.results.passed + this.accessibilityTester.results.failed) +
      (this.performanceTester.results.passed + this.performanceTester.results.failed);
    
    const totalPassed = 
      this.visualTester.results.passed +
      this.accessibilityTester.results.passed +
      this.performanceTester.results.passed;
    
    const overallPassRate = totalTests > 0 ? (totalPassed / totalTests * 100).toFixed(1) : 0;
    
    console.log(`📊 Overall Results:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${totalPassed}`);
    console.log(`   Failed: ${totalTests - totalPassed}`);
    console.log(`   Pass Rate: ${overallPassRate}%`);
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    
    if (overallPassRate >= 95) {
      console.log('   ✅ Excellent! Ready for production deployment.');
    } else if (overallPassRate >= 85) {
      console.log('   ⚠️  Good, but address failing tests before deployment.');
    } else {
      console.log('   ❌ Significant issues found. Review and fix before deployment.');
    }
    
    if (this.visualTester.results.failed > 0) {
      console.log('   🔍 Review visual regression failures for responsive design issues.');
    }
    
    if (this.accessibilityTester.results.failed > 0) {
      console.log('   ♿ Address accessibility issues to ensure inclusive design.');
    }
    
    if (this.performanceTester.results.failed > 0) {
      console.log('   ⚡ Optimize performance metrics for better user experience.');
    }
  }
}

// Export for use in testing environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    IntegrationTestRunner,
    VisualRegressionTester,
    AccessibilityTester,
    PerformanceTester,
    TEST_CONFIG
  };
}

// Auto-run if in browser environment
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const runner = new IntegrationTestRunner();
      runner.runAllTests();
    });
  } else {
    const runner = new IntegrationTestRunner();
    runner.runAllTests();
  }
}