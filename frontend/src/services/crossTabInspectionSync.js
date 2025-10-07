/**
 * Cross-Tab Inspection Synchronization Service
 * Service Worker 방식으로 대체됨 - 호환성을 위한 빈 구현
 */

class CrossTabInspectionSync {
  constructor() {
    console.log('⚠️ [CrossTabSync] This service has been replaced by Service Worker implementation');
  }

  initialize() {
    // Service Worker로 대체됨
  }

  updateInspection() {
    // Service Worker로 대체됨
  }

  addListener() {
    // Service Worker로 대체됨
    return () => {};
  }
}

const crossTabSync = new CrossTabInspectionSync();

export default crossTabSync;