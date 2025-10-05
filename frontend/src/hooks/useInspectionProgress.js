/**
 * Enhanced Inspection Progress Hook
 * 검사 진행률 모니터링을 위한 커스텀 훅
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { inspectionService } from '../services';
import webSocketService from '../services/websocketService';

/**
 * Enhanced inspection progress monitoring hook
 * @param {string} inspectionId - Inspection ID to monitor
 * @param {Object} options - Monitoring options
 * @returns {Object} Progress monitoring state and controls
 */
export const useInspectionProgress = (inspectionId, options = {}) => {
  // State
  const [progressData, setProgressData] = useState({
    status: 'PENDING',
    progress: {
      percentage: 0,
      currentStep: null,
      completedSteps: 0,
      totalSteps: 0,
      resourcesProcessed: 0
    },
    estimatedTimeRemaining: null,
    elapsedTime: 0,
    startTime: null,
    lastUpdated: null,
    velocity: null,
    trend: 'unknown',
    isStagnant: false,
    stagnantCount: 0
  });

  const [connectionStatus, setConnectionStatus] = useState({
    isConnected: false,
    connectionType: 'none', // 'websocket', 'polling', 'none'
    lastUpdate: null,
    errorCount: 0
  });

  const [error, setError] = useState(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Refs for cleanup and control
  const monitoringControllerRef = useRef(null);
  const progressHistoryRef = useRef([]);
  const stagnationTimerRef = useRef(null);
  const lastProgressRef = useRef(null);

  // Options with defaults
  const {
    stagnantThreshold = 8,
    onProgressChange,
    onStepChange,
    onTimeUpdate,
    onComplete,
    onError: onErrorCallback,
    onStagnant
  } = options;

  /**
   * Calculate enhanced progress metrics
   */
  const calculateProgressMetrics = useCallback((newProgress, timestamp = Date.now()) => {
    const history = progressHistoryRef.current;
    
    // Add to history
    history.push({
      timestamp,
      percentage: newProgress.percentage || 0,
      step: newProgress.currentStep,
      resourcesProcessed: newProgress.resourcesProcessed || 0
    });

    // Keep only recent 20 entries
    if (history.length > 20) {
      history.shift();
    }

    // Calculate velocity (percentage per minute)
    let velocity = null;
    if (history.length >= 2) {
      const recent = history.slice(-5); // Use last 5 points
      if (recent.length >= 2) {
        const timeDiff = recent[recent.length - 1].timestamp - recent[0].timestamp;
        const progressDiff = recent[recent.length - 1].percentage - recent[0].percentage;
        if (timeDiff > 0) {
          velocity = (progressDiff / timeDiff) * 60000; // per minute
        }
      }
    }

    // Calculate trend
    let trend = 'unknown';
    if (history.length >= 3) {
      const recent = history.slice(-3);
      const velocity1 = (recent[1].percentage - recent[0].percentage) / 
                       (recent[1].timestamp - recent[0].timestamp);
      const velocity2 = (recent[2].percentage - recent[1].percentage) / 
                       (recent[2].timestamp - recent[1].timestamp);
      const velocityChange = velocity2 - velocity1;

      if (Math.abs(velocityChange) < 0.0001) trend = 'steady';
      else if (velocityChange > 0.0001) trend = 'accelerating';
      else if (velocityChange < -0.0001) trend = 'decelerating';
      else trend = 'stagnant';
    }

    // Calculate processing speed
    const elapsedTime = timestamp - (progressData.startTime || timestamp);
    let processingSpeed = null;
    if (newProgress.resourcesProcessed && elapsedTime > 0) {
      processingSpeed = (newProgress.resourcesProcessed / elapsedTime) * 60000; // per minute
    }

    return {
      velocity,
      trend,
      processingSpeed,
      progressHistory: [...history]
    };
  }, [progressData.startTime]);

  /**
   * Handle progress update
   */
  const handleProgressUpdate = useCallback((update) => {
    const timestamp = Date.now();
    const metrics = calculateProgressMetrics(update, timestamp);
    
    setProgressData(prev => {
      const newData = {
        ...prev,
        progress: {
          ...prev.progress,
          ...update
        },
        velocity: metrics.velocity,
        trend: metrics.trend,
        processingSpeed: metrics.processingSpeed,
        lastUpdated: timestamp,
        isStagnant: false,
        stagnantCount: 0
      };

      // Check for stagnation
      if (lastProgressRef.current !== null && 
          lastProgressRef.current === update.percentage && 
          update.percentage < 100) {
        newData.stagnantCount = prev.stagnantCount + 1;
        newData.isStagnant = newData.stagnantCount >= stagnantThreshold;
      }

      lastProgressRef.current = update.percentage;
      return newData;
    });

    setConnectionStatus(prev => ({
      ...prev,
      lastUpdate: timestamp,
      errorCount: 0
    }));

    // Clear any existing error
    setError(null);

    // Trigger callbacks
    if (onProgressChange) {
      onProgressChange({
        ...update,
        ...metrics
      });
    }
  }, [calculateProgressMetrics, onProgressChange, stagnantThreshold]);

  /**
   * Handle step change
   */
  const handleStepChange = useCallback((stepData) => {
    setProgressData(prev => ({
      ...prev,
      progress: {
        ...prev.progress,
        currentStep: stepData.currentStep,
        completedSteps: stepData.completedSteps,
        totalSteps: stepData.totalSteps
      }
    }));

    if (onStepChange) {
      onStepChange(stepData);
    }
  }, [onStepChange]);

  /**
   * Handle time update
   */
  const handleTimeUpdate = useCallback((timeData) => {
    setProgressData(prev => ({
      ...prev,
      elapsedTime: timeData.elapsedTime,
      estimatedTimeRemaining: timeData.estimatedTimeRemaining,
      startTime: timeData.startTime,
      lastUpdated: timeData.lastUpdated
    }));

    if (onTimeUpdate) {
      onTimeUpdate(timeData);
    }
  }, [onTimeUpdate]);

  /**
   * Handle completion
   */
  const handleComplete = useCallback(async (completionData) => {
    
    // 이미 완료 처리된 경우 중복 실행 방지 (하지만 onComplete 콜백은 한 번은 호출해야 함)
    if (!isMonitoring) {
      if (onComplete) {
        onComplete({
          ...completionData,
          progressHistory: [...progressHistoryRef.current]
        });
      }
      return;
    }
    
    setProgressData(prev => ({
      ...prev,
      status: completionData.status || 'COMPLETED',
      progress: {
        ...prev.progress,
        percentage: 100
      },
      estimatedTimeRemaining: 0,
      completedAt: Date.now()
    }));

    setIsMonitoring(false);
    setConnectionStatus(prev => ({
      ...prev,
      connectionType: 'none'
    }));

    // 검사 완료 시 실제 검사 결과를 가져옴 (한 번만)
    try {
      const inspectionResult = await inspectionService.getInspectionDetails(inspectionId);
      
      if (inspectionResult.success && inspectionResult.data) {
        
        if (onComplete) {
          onComplete({
            ...completionData,
            ...inspectionResult.data, // 실제 검사 결과 포함
            progressHistory: [...progressHistoryRef.current]
          });
        }
      } else {
        if (onComplete) {
          onComplete({
            ...completionData,
            progressHistory: [...progressHistoryRef.current]
          });
        }
      }
    } catch (error) {
      if (onComplete) {
        onComplete({
          ...completionData,
          progressHistory: [...progressHistoryRef.current]
        });
      }
    }
  }, [onComplete, inspectionId, isMonitoring]);

  /**
   * Handle error
   */
  const handleError = useCallback((errorData) => {
    setError(errorData);
    setConnectionStatus(prev => ({
      ...prev,
      errorCount: prev.errorCount + 1
    }));

    if (onErrorCallback) {
      onErrorCallback(errorData);
    }
  }, [onErrorCallback]);

  /**
   * Handle stagnation
   */
  const handleStagnant = useCallback((stagnantData) => {
    setProgressData(prev => ({
      ...prev,
      isStagnant: true,
      stagnantCount: stagnantData.stagnantCount
    }));

    if (onStagnant) {
      onStagnant(stagnantData);
    }
  }, [onStagnant]);

  /**
   * Handle WebSocket disconnection
   */
  const handleDisconnection = useCallback((disconnectionData) => {
    
    setConnectionStatus(prev => ({
      ...prev,
      isConnected: false,
      connectionType: 'none',
      lastUpdate: Date.now()
    }));

    // 검사가 진행 중이었다면 모니터링 중지
    if (isMonitoring) {
      setIsMonitoring(false);
    }
  }, [isMonitoring]);

  /**
   * Start monitoring
   */
  const startMonitoring = useCallback(async () => {
    if (!inspectionId || isMonitoring) {
      return;
    }

    setIsMonitoring(true);
    setError(null);
    progressHistoryRef.current = [];
    lastProgressRef.current = null;

    try {
      const controller = await inspectionService.startWebSocketMonitoring(
        inspectionId,
        {
          onProgress: handleProgressUpdate,
          onStepChange: handleStepChange,
          onTimeUpdate: handleTimeUpdate,
          onComplete: handleComplete,
          onError: handleError,
          onStagnant: handleStagnant,
          onDisconnection: handleDisconnection
        },
        {
          stagnantThreshold
        }
      );

      setConnectionStatus(prev => ({
        ...prev,
        isConnected: true,
        connectionType: 'websocket'
      }));

      monitoringControllerRef.current = controller;

    } catch (error) {
      setError({
        code: 'MONITORING_START_FAILED',
        message: 'Failed to start progress monitoring',
        originalError: error
      });
      setIsMonitoring(false);
    }
  }, [
    inspectionId,
    isMonitoring,
    stagnantThreshold,
    handleProgressUpdate,
    handleStepChange,
    handleTimeUpdate,
    handleComplete,
    handleError,
    handleStagnant
  ]);

  /**
   * Stop monitoring
   */
  const stopMonitoring = useCallback(() => {
    if (monitoringControllerRef.current) {
      monitoringControllerRef.current.stop();
      monitoringControllerRef.current = null;
    }

    if (stagnationTimerRef.current) {
      clearTimeout(stagnationTimerRef.current);
      stagnationTimerRef.current = null;
    }

    setIsMonitoring(false);
    setConnectionStatus(prev => ({
      ...prev,
      isConnected: false,
      connectionType: 'none'
    }));
  }, []);

  /**
   * Restart monitoring
   */
  const restartMonitoring = useCallback(() => {
    stopMonitoring();
    setTimeout(() => {
      startMonitoring();
    }, 1000);
  }, [stopMonitoring, startMonitoring]);

  // Auto-start monitoring when inspectionId changes
  useEffect(() => {
    if (inspectionId && !isMonitoring) {
      startMonitoring();
    }

    return () => {
      stopMonitoring();
    };
  }, [inspectionId]); // startMonitoring, stopMonitoring 제거하여 무한 루프 방지

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);

  /**
   * Get current progress statistics
   */
  const getProgressStatistics = useCallback(() => {
    const history = progressHistoryRef.current;
    const currentTime = Date.now();
    
    return {
      totalDataPoints: history.length,
      averageVelocity: progressData.velocity,
      currentTrend: progressData.trend,
      elapsedTime: progressData.elapsedTime,
      estimatedTimeRemaining: progressData.estimatedTimeRemaining,
      isStagnant: progressData.isStagnant,
      stagnantCount: progressData.stagnantCount,
      connectionType: connectionStatus.connectionType,
      errorCount: connectionStatus.errorCount,
      lastUpdate: connectionStatus.lastUpdate,
      timeSinceLastUpdate: connectionStatus.lastUpdate ? 
        currentTime - connectionStatus.lastUpdate : null
    };
  }, [progressData, connectionStatus]);

  return {
    // Progress data
    progressData,
    connectionStatus,
    error,
    isMonitoring,

    // Control functions
    startMonitoring,
    stopMonitoring,
    restartMonitoring,

    // Utility functions
    getProgressStatistics,
    
    // Raw data access
    getProgressHistory: () => [...progressHistoryRef.current],
    getCurrentController: () => monitoringControllerRef.current
  };
};

export default useInspectionProgress;