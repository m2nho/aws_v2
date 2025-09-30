#!/usr/bin/env node

/**
 * Deployment Script for Optimized CSS
 * Safely replaces existing CSS files with optimized versions
 */

const fs = require('fs');
const path = require('path');

class CSSDeploymentManager {
  constructor() {
    this.backupDir = path.join(__dirname, 'styles', 'backup');
    this.stylesDir = path.join(__dirname, 'styles');
    this.results = {
      backed_up: [],
      deployed: [],
      errors: []
    };
  }

  /**
   * Main deployment process
   */
  async deploy() {
    console.log('🚀 Starting CSS Optimization Deployment...\n');
    
    try {
      // Step 1: Create backup directory
      await this.createBackupDirectory();
      
      // Step 2: Backup existing files
      await this.backupExistingFiles();
      
      // Step 3: Deploy optimized files
      await this.deployOptimizedFiles();
      
      // Step 4: Update index.css
      await this.updateIndexCSS();
      
      // Step 5: Clean up redundant files
      await this.cleanupRedundantFiles();
      
      // Step 6: Generate deployment report
      this.generateDeploymentReport();
      
      console.log('\n✅ CSS Optimization Deployment Complete!');
      
    } catch (error) {
      console.error('\n❌ Deployment failed:', error.message);
      console.log('\n🔄 Rolling back changes...');
      await this.rollback();
    }
  }

  /**
   * Create backup directory
   */
  async createBackupDirectory() {
    console.log('📁 Creating backup directory...');
    
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      console.log(`   Created: ${this.backupDir}`);
    } else {
      console.log('   Backup directory already exists');
    }
  }

  /**
   * Backup existing CSS files
   */
  async backupExistingFiles() {
    console.log('\n💾 Backing up existing CSS files...');
    
    const filesToBackup = [
      'globals.css',
      'utilities.css', 
      'components.css',
      '../index.css'
    ];
    
    for (const file of filesToBackup) {
      try {
        const sourcePath = path.join(this.stylesDir, file);
        const backupPath = path.join(this.backupDir, path.basename(file));
        
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, backupPath);
          this.results.backed_up.push(file);
          console.log(`   ✅ Backed up: ${file}`);
        } else {
          console.log(`   ⚠️  File not found: ${file}`);
        }
      } catch (error) {
        this.results.errors.push(`Failed to backup ${file}: ${error.message}`);
        console.log(`   ❌ Failed to backup: ${file}`);
      }
    }
  }

  /**
   * Deploy optimized CSS files
   */
  async deployOptimizedFiles() {
    console.log('\n🎨 Deploying optimized CSS files...');
    
    const deployments = [
      {
        source: 'globals-optimized.css',
        target: 'globals.css'
      },
      {
        source: 'utilities-optimized.css',
        target: 'utilities.css'
      },
      {
        source: 'components-optimized.css',
        target: 'components.css'
      }
    ];
    
    for (const deployment of deployments) {
      try {
        const sourcePath = path.join(this.stylesDir, deployment.source);
        const targetPath = path.join(this.stylesDir, deployment.target);
        
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, targetPath);
          this.results.deployed.push(deployment.target);
          console.log(`   ✅ Deployed: ${deployment.source} → ${deployment.target}`);
        } else {
          throw new Error(`Optimized file not found: ${deployment.source}`);
        }
      } catch (error) {
        this.results.errors.push(`Failed to deploy ${deployment.target}: ${error.message}`);
        console.log(`   ❌ Failed to deploy: ${deployment.target}`);
        throw error;
      }
    }
  }

  /**
   * Update index.css with optimized version
   */
  async updateIndexCSS() {
    console.log('\n📝 Updating index.css...');
    
    try {
      const optimizedIndexPath = path.join(__dirname, 'index-optimized.css');
      const indexPath = path.join(__dirname, 'index.css');
      
      if (fs.existsSync(optimizedIndexPath)) {
        fs.copyFileSync(optimizedIndexPath, indexPath);
        this.results.deployed.push('index.css');
        console.log('   ✅ Updated: index.css');
      } else {
        throw new Error('Optimized index.css not found');
      }
    } catch (error) {
      this.results.errors.push(`Failed to update index.css: ${error.message}`);
      console.log('   ❌ Failed to update: index.css');
      throw error;
    }
  }

  /**
   * Clean up redundant files
   */
  async cleanupRedundantFiles() {
    console.log('\n🧹 Cleaning up redundant files...');
    
    const filesToRemove = [
      'accessibility.css',
      'responsive-enhancements.css',
      'accessibility-enhancements.css'
    ];
    
    for (const file of filesToRemove) {
      try {
        const filePath = path.join(this.stylesDir, file);
        
        if (fs.existsSync(filePath)) {
          // Move to backup instead of deleting
          const backupPath = path.join(this.backupDir, file);
          fs.copyFileSync(filePath, backupPath);
          fs.unlinkSync(filePath);
          console.log(`   ✅ Moved to backup: ${file}`);
        }
      } catch (error) {
        console.log(`   ⚠️  Could not remove: ${file} (${error.message})`);
      }
    }
  }

  /**
   * Generate deployment report
   */
  generateDeploymentReport() {
    console.log('\n📊 Deployment Report');
    console.log('=====================');
    
    console.log(`✅ Files backed up: ${this.results.backed_up.length}`);
    this.results.backed_up.forEach(file => console.log(`   - ${file}`));
    
    console.log(`\n🎨 Files deployed: ${this.results.deployed.length}`);
    this.results.deployed.forEach(file => console.log(`   - ${file}`));
    
    if (this.results.errors.length > 0) {
      console.log(`\n❌ Errors: ${this.results.errors.length}`);
      this.results.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    // Calculate file size savings
    this.calculateSizeSavings();
  }

  /**
   * Calculate file size savings
   */
  calculateSizeSavings() {
    console.log('\n💾 File Size Analysis');
    console.log('=====================');
    
    try {
      const files = ['globals.css', 'utilities.css', 'components.css'];
      let totalOriginal = 0;
      let totalOptimized = 0;
      
      files.forEach(file => {
        const originalPath = path.join(this.backupDir, file);
        const optimizedPath = path.join(this.stylesDir, file);
        
        if (fs.existsSync(originalPath) && fs.existsSync(optimizedPath)) {
          const originalSize = fs.statSync(originalPath).size;
          const optimizedSize = fs.statSync(optimizedPath).size;
          const savings = originalSize - optimizedSize;
          const savingsPercent = ((savings / originalSize) * 100).toFixed(1);
          
          console.log(`${file}:`);
          console.log(`   Original: ${(originalSize / 1024).toFixed(1)}KB`);
          console.log(`   Optimized: ${(optimizedSize / 1024).toFixed(1)}KB`);
          console.log(`   Savings: ${(savings / 1024).toFixed(1)}KB (${savingsPercent}%)`);
          
          totalOriginal += originalSize;
          totalOptimized += optimizedSize;
        }
      });
      
      const totalSavings = totalOriginal - totalOptimized;
      const totalSavingsPercent = ((totalSavings / totalOriginal) * 100).toFixed(1);
      
      console.log('\nTotal:');
      console.log(`   Original: ${(totalOriginal / 1024).toFixed(1)}KB`);
      console.log(`   Optimized: ${(totalOptimized / 1024).toFixed(1)}KB`);
      console.log(`   Total Savings: ${(totalSavings / 1024).toFixed(1)}KB (${totalSavingsPercent}%)`);
      
    } catch (error) {
      console.log('   Could not calculate size savings:', error.message);
    }
  }

  /**
   * Rollback changes in case of failure
   */
  async rollback() {
    console.log('🔄 Rolling back changes...');
    
    const filesToRestore = [
      'globals.css',
      'utilities.css',
      'components.css'
    ];
    
    for (const file of filesToRestore) {
      try {
        const backupPath = path.join(this.backupDir, file);
        const targetPath = path.join(this.stylesDir, file);
        
        if (fs.existsSync(backupPath)) {
          fs.copyFileSync(backupPath, targetPath);
          console.log(`   ✅ Restored: ${file}`);
        }
      } catch (error) {
        console.log(`   ❌ Failed to restore: ${file}`);
      }
    }
    
    // Restore index.css
    try {
      const backupIndexPath = path.join(this.backupDir, 'index.css');
      const indexPath = path.join(__dirname, 'index.css');
      
      if (fs.existsSync(backupIndexPath)) {
        fs.copyFileSync(backupIndexPath, indexPath);
        console.log('   ✅ Restored: index.css');
      }
    } catch (error) {
      console.log('   ❌ Failed to restore: index.css');
    }
    
    console.log('🔄 Rollback complete');
  }

  /**
   * Verify deployment success
   */
  async verify() {
    console.log('\n🔍 Verifying deployment...');
    
    const requiredFiles = [
      'styles/globals.css',
      'styles/utilities.css',
      'styles/components.css',
      'index.css'
    ];
    
    let allFilesExist = true;
    
    for (const file of requiredFiles) {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        console.log(`   ✅ ${file} exists`);
      } else {
        console.log(`   ❌ ${file} missing`);
        allFilesExist = false;
      }
    }
    
    if (allFilesExist) {
      console.log('\n✅ All files deployed successfully');
    } else {
      console.log('\n❌ Some files are missing');
      throw new Error('Deployment verification failed');
    }
  }
}

// Run deployment if called directly
if (require.main === module) {
  const deployer = new CSSDeploymentManager();
  
  deployer.deploy()
    .then(() => deployer.verify())
    .then(() => {
      console.log('\n🎉 CSS Optimization Deployment Successful!');
      console.log('\n📋 Next Steps:');
      console.log('   1. Test the application thoroughly');
      console.log('   2. Run integration tests');
      console.log('   3. Check browser compatibility');
      console.log('   4. Monitor performance metrics');
      console.log('\n💡 To rollback if needed:');
      console.log('   - Restore files from styles/backup/ directory');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Deployment failed:', error.message);
      process.exit(1);
    });
}

module.exports = CSSDeploymentManager;