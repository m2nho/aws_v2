/**
 * Inspection Status and Progress Model
 * 검사 상태 및 진행률 모델 구현
 * Requirements: 1.1, 2.3, 5.1
 */

class InspectionStatus {
  constructor({
    inspectionId,
    status = 'PENDING',
    progress = null,
    estimatedTimeRemaining = null,
    currentStep = null,
    error = null,
    batchId = null,
    itemId = null,
    itemName = null
  }) {
    this.inspectionId = inspectionId;
    this.status = status;
    this.progress = progress;
    this.estimatedTimeRemaining = estimatedTimeRemaining;
    this.currentStep = currentStep;
    this.error = error;
    this.batchId = batchId;
    this.itemId = itemId;
    this.itemName = itemName;
    this.startTime = Date.now();
    this.lastUpdated = Date.now();
    
    // Enhanced progress tracking
    this.progressHistory = [];
    this.stepTimings = new Map();
    this.averageStepDuration = null;
  }

  /**
   * 진행률 업데이트
   * @param {Object} progressData - 진행률 데이터
   */
  updateProgress({
    currentStep,
    completedSteps,
    totalSteps,
    percentage,
    estimatedTimeRemaining,
    resourcesProcessed = null
  }) {
    const now = Date.now();
    const previousStep = this.currentStep;
    
    // Record step timing if step changed
    if (previousStep && previousStep !== currentStep) {
      const stepDuration = now - this.lastUpdated;
      this.stepTimings.set(previousStep, stepDuration);
      this.updateAverageStepDuration();
    }
    
    // Update current progress
    this.currentStep = currentStep;
    this.progress = {
      currentStep,
      completedSteps,
      totalSteps,
      percentage: Math.min(100, Math.max(0, percentage)),
      resourcesProcessed
    };
    
    // Record progress history for trend analysis
    this.progressHistory.push({
      timestamp: now,
      percentage,
      currentStep,
      completedSteps
    });
    
    // Keep only last 10 progress points for memory efficiency
    if (this.progressHistory.length > 10) {
      this.progressHistory.shift();
    }
    
    // Calculate enhanced time estimation
    this.estimatedTimeRemaining = estimatedTimeRemaining || this.calculateEnhancedTimeEstimate();
    this.lastUpdated = now;
    
    // 진행률에 따른 상태 자동 업데이트
    if (percentage > 0 && this.status === 'PENDING') {
      this.status = 'IN_PROGRESS';
    }
  }

  /**
   * 검사 시작
   * @param {string} initialStep - 초기 단계 설명
   */
  start(initialStep = 'Initializing inspection') {
    this.status = 'IN_PROGRESS';
    this.currentStep = initialStep;
    this.startTime = Date.now();
    this.progress = {
      currentStep: initialStep,
      completedSteps: 0,
      totalSteps: 1,
      percentage: 0
    };
    this.lastUpdated = Date.now();
    
    // Initialize progress tracking
    this.progressHistory = [{
      timestamp: this.startTime,
      percentage: 0,
      currentStep: initialStep,
      completedSteps: 0
    }];
  }

  /**
   * 검사 완료
   */
  complete() {
    this.status = 'COMPLETED';
    this.currentStep = 'Inspection completed';
    this.progress = {
      currentStep: 'Inspection completed',
      completedSteps: this.progress?.totalSteps || 1,
      totalSteps: this.progress?.totalSteps || 1,
      percentage: 100
    };
    this.estimatedTimeRemaining = 0;
    this.lastUpdated = Date.now();
  }

  /**
   * 검사 실패
   * @param {string} errorMessage - 오류 메시지
   */
  fail(errorMessage) {
    this.status = 'FAILED';
    this.error = errorMessage;
    this.currentStep = 'Inspection failed';
    this.estimatedTimeRemaining = 0;
    this.lastUpdated = Date.now();
  }

  /**
   * API 응답용 객체 변환
   * @returns {Object} API 응답 형식
   */
  toApiResponse() {
    const response = {
      inspectionId: this.inspectionId,
      status: this.status,
      startTime: this.startTime,
      lastUpdated: this.lastUpdated
    };

    if (this.batchId) {
      response.batchId = this.batchId;
    }

    if (this.itemId) {
      response.itemId = this.itemId;
    }

    if (this.itemName) {
      response.itemName = this.itemName;
    }

    if (this.progress) {
      response.progress = { ...this.progress };
    }

    if (this.estimatedTimeRemaining !== null) {
      response.estimatedTimeRemaining = this.estimatedTimeRemaining;
    }

    if (this.currentStep) {
      response.currentStep = this.currentStep;
    }

    if (this.error) {
      response.error = this.error;
    }

    // Include progress statistics for debugging/monitoring
    if (process.env.NODE_ENV === 'development') {
      response.statistics = this.getProgressStatistics();
    }

    return response;
  }

  /**
   * 상태 유효성 검증
   * @returns {Object} 유효성 검증 결과
   */
  validate() {
    const errors = [];

    if (!this.inspectionId) {
      errors.push('inspectionId is required');
    }

    const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'];
    if (!validStatuses.includes(this.status)) {
      errors.push(`status must be one of: ${validStatuses.join(', ')}`);
    }

    if (this.progress) {
      if (typeof this.progress.percentage !== 'number' || 
          this.progress.percentage < 0 || 
          this.progress.percentage > 100) {
        errors.push('progress.percentage must be a number between 0 and 100');
      }

      if (typeof this.progress.completedSteps !== 'number' || 
          this.progress.completedSteps < 0) {
        errors.push('progress.completedSteps must be a non-negative number');
      }

      if (typeof this.progress.totalSteps !== 'number' || 
          this.progress.totalSteps <= 0) {
        errors.push('progress.totalSteps must be a positive number');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 진행률 계산 헬퍼 메서드
   * @param {number} completedSteps - 완료된 단계 수
   * @param {number} totalSteps - 전체 단계 수
   * @returns {number} 진행률 (0-100)
   */
  static calculatePercentage(completedSteps, totalSteps) {
    if (totalSteps <= 0) return 0;
    return Math.round((completedSteps / totalSteps) * 100);
  }

  /**
   * Update average step duration
   */
  updateAverageStepDuration() {
    if (this.stepTimings.size === 0) return;
    
    const durations = Array.from(this.stepTimings.values());
    this.averageStepDuration = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  }

  /**
   * Calculate enhanced time estimate using multiple methods
   * @returns {number} Estimated time remaining in milliseconds
   */
  calculateEnhancedTimeEstimate() {
    if (!this.progress || this.progress.percentage <= 0) return null;
    
    const estimates = [];
    
    // Method 1: Linear progression based estimate
    const linearEstimate = InspectionStatus.estimateTimeRemaining(this.startTime, this.progress.percentage);
    if (linearEstimate !== null) {
      estimates.push(linearEstimate);
    }
    
    // Method 2: Trend-based estimate using progress history
    const trendEstimate = this.calculateTrendBasedEstimate();
    if (trendEstimate !== null) {
      estimates.push(trendEstimate);
    }
    
    // Method 3: Step-based estimate using average step duration
    const stepEstimate = this.calculateStepBasedEstimate();
    if (stepEstimate !== null) {
      estimates.push(stepEstimate);
    }
    
    if (estimates.length === 0) return null;
    
    // Use weighted average of estimates
    // Give more weight to trend-based estimate if we have enough history
    let weightedSum = 0;
    let totalWeight = 0;
    
    estimates.forEach((estimate, index) => {
      let weight = 1;
      if (index === 1 && this.progressHistory.length >= 5) weight = 2; // Trend estimate
      if (index === 2 && this.stepTimings.size >= 3) weight = 1.5; // Step estimate
      
      weightedSum += estimate * weight;
      totalWeight += weight;
    });
    
    return Math.round(weightedSum / totalWeight);
  }

  /**
   * Calculate trend-based time estimate using progress velocity
   * @returns {number|null} Estimated time remaining in milliseconds
   */
  calculateTrendBasedEstimate() {
    if (this.progressHistory.length < 3) return null;
    
    // Calculate progress velocity (percentage per millisecond)
    const recentHistory = this.progressHistory.slice(-5); // Use last 5 points
    let totalVelocity = 0;
    let velocityCount = 0;
    
    for (let i = 1; i < recentHistory.length; i++) {
      const timeDiff = recentHistory[i].timestamp - recentHistory[i - 1].timestamp;
      const progressDiff = recentHistory[i].percentage - recentHistory[i - 1].percentage;
      
      if (timeDiff > 0 && progressDiff > 0) {
        totalVelocity += progressDiff / timeDiff;
        velocityCount++;
      }
    }
    
    if (velocityCount === 0) return null;
    
    const averageVelocity = totalVelocity / velocityCount;
    const remainingProgress = 100 - this.progress.percentage;
    
    return Math.round(remainingProgress / averageVelocity);
  }

  /**
   * Calculate step-based time estimate using average step duration
   * @returns {number|null} Estimated time remaining in milliseconds
   */
  calculateStepBasedEstimate() {
    if (!this.averageStepDuration || !this.progress) return null;
    
    const remainingSteps = this.progress.totalSteps - this.progress.completedSteps;
    if (remainingSteps <= 0) return 0;
    
    return Math.round(remainingSteps * this.averageStepDuration);
  }

  /**
   * Get progress statistics for monitoring
   * @returns {Object} Progress statistics
   */
  getProgressStatistics() {
    const now = Date.now();
    const elapsedTime = now - this.startTime;
    
    return {
      elapsedTime,
      averageStepDuration: this.averageStepDuration,
      completedSteps: this.stepTimings.size,
      progressVelocity: this.calculateCurrentVelocity(),
      estimationAccuracy: this.calculateEstimationAccuracy()
    };
  }

  /**
   * Calculate current progress velocity
   * @returns {number|null} Progress velocity (percentage per minute)
   */
  calculateCurrentVelocity() {
    if (this.progressHistory.length < 2) return null;
    
    const recent = this.progressHistory.slice(-2);
    const timeDiff = recent[1].timestamp - recent[0].timestamp;
    const progressDiff = recent[1].percentage - recent[0].percentage;
    
    if (timeDiff <= 0) return null;
    
    // Convert to percentage per minute
    return (progressDiff / timeDiff) * 60000;
  }

  /**
   * Calculate estimation accuracy based on historical predictions
   * @returns {number|null} Accuracy percentage (0-100)
   */
  calculateEstimationAccuracy() {
    // This would require storing historical estimates vs actual completion times
    // For now, return null as this would need more complex tracking
    return null;
  }

  /**
   * 예상 완료 시간 계산 헬퍼 메서드
   * @param {number} startTime - 시작 시간 (timestamp)
   * @param {number} currentProgress - 현재 진행률 (0-100)
   * @returns {number} 예상 남은 시간 (milliseconds)
   */
  static estimateTimeRemaining(startTime, currentProgress) {
    if (currentProgress <= 0) return null;
    
    const elapsedTime = Date.now() - startTime;
    const totalEstimatedTime = (elapsedTime / currentProgress) * 100;
    const remainingTime = totalEstimatedTime - elapsedTime;
    
    return Math.max(0, Math.round(remainingTime));
  }
}

module.exports = InspectionStatus;