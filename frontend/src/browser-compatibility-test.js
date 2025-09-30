/**
 * Browser Compatibility Test Suite
 * Tests CSS features and JavaScript functionality across different browsers
 */

class BrowserCompatibilityTester {
  constructor() {
    this.results = {
      browser: this.detectBrowser(),
      features: {},
      passed: 0,
      failed: 0,
      warnings: 0
    };
  }

  /**
   * Detect current browser
   */
  detectBrowser() {
    const userAgent = navigator.userAgent;
    
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      return { name: 'Chrome', version: this.extractVersion(userAgent, 'Chrome/') };
    } else if (userAgent.includes('Firefox')) {
      return { name: 'Firefox', version: this.extractVersion(userAgent, 'Firefox/') };
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      return { name: 'Safari', version: this.extractVersion(userAgent, 'Version/') };
    } else if (userAgent.includes('Edg')) {
      return { name: 'Edge', version: this.extractVersion(userAgent, 'Edg/') };
    } else {
      return { name: 'Unknown', version: 'Unknown' };
    }
  }

  /**
   * Extract version from user agent string
   */
  extractVersion(userAgent, prefix) {
    const start = userAgent.indexOf(prefix) + prefix.length;
    const end = userAgent.indexOf(' ', start);
    return userAgent.substring(start, end === -1 ? undefined : end).split('.')[0];
  }

  /**
   * Run all compatibility tests
   */
  async runAllTests() {
    console.log(`🌐 Testing browser compatibility for ${this.results.browser.name} ${this.results.browser.version}...`);
    
    this.testCSSFeatures();
    this.testJavaScriptFeatures();
    this.testWebAPIs();
    this.testResponsiveFeatures();
    
    return this.generateReport();
  }

  /**
   * Test CSS features used in the design system
   */
  testCSSFeatures() {
    console.log('🎨 Testing CSS features...');
    
    // Test CSS Custom Properties (CSS Variables)
    this.testFeature('CSS Custom Properties', () => {
      const testElement = document.createElement('div');
      testElement.style.setProperty('--test-var', 'test');
      return testElement.style.getPropertyValue('--test-var') === 'test';
    });

    // Test CSS Grid
    this.testFeature('CSS Grid', () => {
      const testElement = document.createElement('div');
      testElement.style.display = 'grid';
      return window.getComputedStyle(testElement).display === 'grid';
    });

    // Test Flexbox
    this.testFeature('Flexbox', () => {
      const testElement = document.createElement('div');
      testElement.style.display = 'flex';
      return window.getComputedStyle(testElement).display === 'flex';
    });

    // Test CSS Transforms
    this.testFeature('CSS Transforms', () => {
      const testElement = document.createElement('div');
      testElement.style.transform = 'translateX(10px)';
      return testElement.style.transform === 'translateX(10px)';
    });

    // Test CSS Transitions
    this.testFeature('CSS Transitions', () => {
      const testElement = document.createElement('div');
      testElement.style.transition = 'all 0.3s ease';
      return testElement.style.transition.includes('all');
    });

    // Test CSS calc()
    this.testFeature('CSS calc()', () => {
      const testElement = document.createElement('div');
      testElement.style.width = 'calc(100% - 20px)';
      return testElement.style.width.includes('calc');
    });

    // Test CSS :focus-visible
    this.testFeature('CSS :focus-visible', () => {
      try {
        document.querySelector(':focus-visible');
        return true;
      } catch (e) {
        return false;
      }
    });

    // Test CSS clamp()
    this.testFeature('CSS clamp()', () => {
      const testElement = document.createElement('div');
      testElement.style.fontSize = 'clamp(1rem, 2vw, 2rem)';
      return testElement.style.fontSize.includes('clamp');
    });

    // Test CSS Container Queries (progressive enhancement)
    this.testFeature('CSS Container Queries', () => {
      return CSS.supports('container-type: inline-size');
    }, false); // Not critical

    // Test CSS aspect-ratio
    this.testFeature('CSS aspect-ratio', () => {
      return CSS.supports('aspect-ratio: 1 / 1');
    }, false); // Not critical
  }

  /**
   * Test JavaScript features
   */
  testJavaScriptFeatures() {
    console.log('⚙️ Testing JavaScript features...');
    
    // Test ES6 Arrow Functions
    this.testFeature('ES6 Arrow Functions', () => {
      try {
        const test = () => true;
        return test() === true;
      } catch (e) {
        return false;
      }
    });

    // Test ES6 Template Literals
    this.testFeature('ES6 Template Literals', () => {
      try {
        const test = `template`;
        return test === 'template';
      } catch (e) {
        return false;
      }
    });

    // Test ES6 Destructuring
    this.testFeature('ES6 Destructuring', () => {
      try {
        const { test } = { test: true };
        return test === true;
      } catch (e) {
        return false;
      }
    });

    // Test ES6 Spread Operator
    this.testFeature('ES6 Spread Operator', () => {
      try {
        const arr1 = [1, 2];
        const arr2 = [...arr1, 3];
        return arr2.length === 3;
      } catch (e) {
        return false;
      }
    });

    // Test Async/Await
    this.testFeature('Async/Await', () => {
      try {
        const test = async () => true;
        return typeof test === 'function';
      } catch (e) {
        return false;
      }
    });

    // Test Promises
    this.testFeature('Promises', () => {
      return typeof Promise !== 'undefined' && typeof Promise.resolve === 'function';
    });

    // Test Fetch API
    this.testFeature('Fetch API', () => {
      return typeof fetch === 'function';
    });
  }

  /**
   * Test Web APIs
   */
  testWebAPIs() {
    console.log('🔌 Testing Web APIs...');
    
    // Test Local Storage
    this.testFeature('Local Storage', () => {
      try {
        localStorage.setItem('test', 'test');
        const result = localStorage.getItem('test') === 'test';
        localStorage.removeItem('test');
        return result;
      } catch (e) {
        return false;
      }
    });

    // Test Session Storage
    this.testFeature('Session Storage', () => {
      try {
        sessionStorage.setItem('test', 'test');
        const result = sessionStorage.getItem('test') === 'test';
        sessionStorage.removeItem('test');
        return result;
      } catch (e) {
        return false;
      }
    });

    // Test History API
    this.testFeature('History API', () => {
      return typeof history !== 'undefined' && typeof history.pushState === 'function';
    });

    // Test Intersection Observer
    this.testFeature('Intersection Observer', () => {
      return typeof IntersectionObserver === 'function';
    }, false); // Not critical

    // Test Resize Observer
    this.testFeature('Resize Observer', () => {
      return typeof ResizeObserver === 'function';
    }, false); // Not critical

    // Test Performance API
    this.testFeature('Performance API', () => {
      return typeof performance !== 'undefined' && typeof performance.now === 'function';
    }, false); // Not critical
  }

  /**
   * Test responsive features
   */
  testResponsiveFeatures() {
    console.log('📱 Testing responsive features...');
    
    // Test Media Queries
    this.testFeature('Media Queries', () => {
      return typeof window.matchMedia === 'function';
    });

    // Test Viewport Meta Tag
    this.testFeature('Viewport Meta Tag', () => {
      const viewport = document.querySelector('meta[name="viewport"]');
      return viewport !== null;
    });

    // Test Touch Events
    this.testFeature('Touch Events', () => {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }, false); // Not critical for desktop

    // Test Pointer Events
    this.testFeature('Pointer Events', () => {
      return 'onpointerdown' in window;
    }, false); // Not critical

    // Test CSS Media Queries in JavaScript
    this.testFeature('CSS Media Queries in JS', () => {
      try {
        const mq = window.matchMedia('(min-width: 768px)');
        return typeof mq.matches === 'boolean';
      } catch (e) {
        return false;
      }
    });
  }

  /**
   * Test individual feature
   */
  testFeature(name, testFunction, critical = true) {
    try {
      const result = testFunction();
      this.results.features[name] = {
        supported: result,
        critical: critical,
        tested: true
      };
      
      if (result) {
        this.results.passed++;
      } else if (critical) {
        this.results.failed++;
      } else {
        this.results.warnings++;
      }
    } catch (error) {
      this.results.features[name] = {
        supported: false,
        critical: critical,
        tested: true,
        error: error.message
      };
      
      if (critical) {
        this.results.failed++;
      } else {
        this.results.warnings++;
      }
    }
  }

  /**
   * Generate compatibility report
   */
  generateReport() {
    const total = this.results.passed + this.results.failed + this.results.warnings;
    const criticalTotal = this.results.passed + this.results.failed;
    const criticalPassRate = criticalTotal > 0 ? (this.results.passed / criticalTotal * 100).toFixed(1) : 0;
    
    console.log('\n🌐 Browser Compatibility Test Results');
    console.log('======================================');
    console.log(`Browser: ${this.results.browser.name} ${this.results.browser.version}`);
    console.log(`✅ Supported: ${this.results.passed}`);
    console.log(`❌ Not Supported: ${this.results.failed}`);
    console.log(`⚠️  Non-Critical: ${this.results.warnings}`);
    console.log(`📈 Critical Pass Rate: ${criticalPassRate}%`);
    
    // Show compatibility status
    if (criticalPassRate >= 100) {
      console.log('🎉 Fully Compatible - All critical features supported');
    } else if (criticalPassRate >= 90) {
      console.log('✅ Mostly Compatible - Minor issues may exist');
    } else if (criticalPassRate >= 75) {
      console.log('⚠️  Partially Compatible - Some features may not work');
    } else {
      console.log('❌ Poor Compatibility - Major features not supported');
    }
    
    // List unsupported critical features
    const unsupportedCritical = Object.entries(this.results.features)
      .filter(([name, feature]) => !feature.supported && feature.critical);
    
    if (unsupportedCritical.length > 0) {
      console.log('\n❌ Unsupported Critical Features:');
      unsupportedCritical.forEach(([name, feature]) => {
        console.log(`  - ${name}${feature.error ? ` (${feature.error})` : ''}`);
      });
    }
    
    // List unsupported non-critical features
    const unsupportedNonCritical = Object.entries(this.results.features)
      .filter(([name, feature]) => !feature.supported && !feature.critical);
    
    if (unsupportedNonCritical.length > 0) {
      console.log('\n⚠️  Unsupported Non-Critical Features:');
      unsupportedNonCritical.forEach(([name, feature]) => {
        console.log(`  - ${name} (Progressive enhancement)`);
      });
    }
    
    // Browser-specific recommendations
    this.generateBrowserRecommendations();
    
    return this.results;
  }

  /**
   * Generate browser-specific recommendations
   */
  generateBrowserRecommendations() {
    console.log('\n💡 Browser-Specific Recommendations:');
    
    const browser = this.results.browser.name;
    const version = parseInt(this.results.browser.version);
    
    switch (browser) {
      case 'Chrome':
        if (version < 90) {
          console.log('  - Consider updating Chrome for better CSS support');
        } else {
          console.log('  - Chrome version is well supported');
        }
        break;
        
      case 'Firefox':
        if (version < 88) {
          console.log('  - Consider updating Firefox for better CSS support');
        } else {
          console.log('  - Firefox version is well supported');
        }
        break;
        
      case 'Safari':
        if (version < 14) {
          console.log('  - Safari version may have limited CSS support');
          console.log('  - Some modern CSS features may not work');
        } else {
          console.log('  - Safari version is adequately supported');
        }
        break;
        
      case 'Edge':
        if (version < 90) {
          console.log('  - Consider updating Edge for better support');
        } else {
          console.log('  - Edge version is well supported');
        }
        break;
        
      default:
        console.log('  - Unknown browser - compatibility may vary');
        console.log('  - Test thoroughly before deployment');
    }
    
    // General recommendations
    if (this.results.failed > 0) {
      console.log('  - Consider providing fallbacks for unsupported features');
      console.log('  - Test with polyfills if necessary');
    }
    
    if (this.results.warnings > 0) {
      console.log('  - Non-critical features will degrade gracefully');
    }
  }
}

// Export for use in testing environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrowserCompatibilityTester;
}

// Auto-run if in browser environment
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const tester = new BrowserCompatibilityTester();
      tester.runAllTests();
    });
  } else {
    const tester = new BrowserCompatibilityTester();
    tester.runAllTests();
  }
}