/**
 * Inspector Module Index
 * 검사 모듈들의 중앙 관리 및 레지스트리
 * Requirements: 4.1, 4.3
 */

const BaseInspector = require('./baseInspector');
const EC2Inspector = require('./ec2/index');
const IAMInspector = require('./iam/index');
const S3Inspector = require('./s3/index');

/**
 * Inspector Registry
 * 등록된 모든 Inspector들을 관리하는 레지스트리
 */
class InspectorRegistry {
  constructor() {
    this.inspectors = new Map();
    this.initializeRegistry();
  }

  /**
   * 레지스트리 초기화
   */
  initializeRegistry() {
    // 기본 Inspector들을 여기에 등록
    this.register('EC2', EC2Inspector);
    this.register('IAM', IAMInspector);
    this.register('S3', S3Inspector);
    // 향후 RDSInspector 등이 추가될 예정
  }

  /**
   * Inspector 등록
   * @param {string} serviceType - 서비스 타입 (예: 'EC2', 'RDS', 'S3')
   * @param {Class} inspectorClass - Inspector 클래스
   */
  register(serviceType, inspectorClass) {
    if (!serviceType || typeof serviceType !== 'string') {
      throw new Error('Service type must be a non-empty string');
    }

    if (!inspectorClass || typeof inspectorClass !== 'function') {
      throw new Error('Inspector class must extend BaseInspector');
    }

    // Check if the class extends BaseInspector by checking prototype chain
    let currentProto = inspectorClass.prototype;
    let extendsBaseInspector = false;

    while (currentProto) {
      if (currentProto.constructor === BaseInspector) {
        extendsBaseInspector = true;
        break;
      }
      currentProto = Object.getPrototypeOf(currentProto);
    }

    if (!extendsBaseInspector) {
      throw new Error('Inspector class must extend BaseInspector');
    }

    this.inspectors.set(serviceType.toUpperCase(), inspectorClass);
  }

  /**
   * Inspector 조회
   * @param {string} serviceType - 서비스 타입
   * @returns {Class|null} Inspector 클래스
   */
  get(serviceType) {
    return this.inspectors.get(serviceType.toUpperCase()) || null;
  }

  /**
   * Inspector 인스턴스 생성
   * @param {string} serviceType - 서비스 타입
   * @param {Object} options - Inspector 옵션
   * @returns {BaseInspector} Inspector 인스턴스
   */
  createInspector(serviceType, options = {}) {
    const InspectorClass = this.get(serviceType);

    if (!InspectorClass) {
      throw new Error(`No inspector found for service type: ${serviceType}`);
    }

    return new InspectorClass(options);
  }

  /**
   * 등록된 모든 서비스 타입 목록 반환
   * @returns {Array<string>} 서비스 타입 목록
   */
  getRegisteredServiceTypes() {
    return Array.from(this.inspectors.keys());
  }

  /**
   * 등록된 Inspector 정보 목록 반환
   * @returns {Array<Object>} Inspector 정보 목록
   */
  getInspectorInfoList() {
    const infoList = [];

    for (const [serviceType, InspectorClass] of this.inspectors) {
      try {
        const tempInstance = new InspectorClass();
        infoList.push(tempInstance.getInspectorInfo());
      } catch (error) {

      }
    }

    return infoList;
  }

  /**
   * Inspector 등록 해제
   * @param {string} serviceType - 서비스 타입
   * @returns {boolean} 해제 성공 여부
   */
  unregister(serviceType) {
    const result = this.inspectors.delete(serviceType.toUpperCase());
    return result;
  }

  /**
   * 모든 Inspector 등록 해제
   */
  clear() {
    this.inspectors.clear();
  }

  /**
   * 특정 서비스 타입이 지원되는지 확인
   * @param {string} serviceType - 서비스 타입
   * @returns {boolean} 지원 여부
   */
  isSupported(serviceType) {
    return this.inspectors.has(serviceType.toUpperCase());
  }
}

// 전역 레지스트리 인스턴스 생성
const registry = new InspectorRegistry();

/**
 * Inspector 팩토리 함수
 * @param {string} serviceType - 서비스 타입
 * @param {Object} options - Inspector 옵션
 * @returns {BaseInspector} Inspector 인스턴스
 */
function createInspector(serviceType, options = {}) {
  return registry.createInspector(serviceType, options);
}

/**
 * 지원되는 서비스 타입 목록 조회
 * @returns {Array<string>} 서비스 타입 목록
 */
function getSupportedServiceTypes() {
  return registry.getRegisteredServiceTypes();
}

/**
 * Inspector 정보 목록 조회
 * @returns {Array<Object>} Inspector 정보 목록
 */
function getInspectorInfoList() {
  return registry.getInspectorInfoList();
}

/**
 * 서비스 타입 지원 여부 확인
 * @param {string} serviceType - 서비스 타입
 * @returns {boolean} 지원 여부
 */
function isServiceTypeSupported(serviceType) {
  return registry.isSupported(serviceType);
}

/**
 * Inspector 조회 (서비스에서 사용)
 * @param {string} serviceType - 서비스 타입
 * @returns {BaseInspector} Inspector 인스턴스
 */
function getInspector(serviceType) {
  return registry.createInspector(serviceType);
}

/**
 * Inspector 정보 조회
 * @param {string} serviceType - 서비스 타입
 * @returns {Object} Inspector 정보
 */
function getInspectorInfo(serviceType) {
  const InspectorClass = registry.get(serviceType);
  if (!InspectorClass) {
    return null;
  }

  try {
    const tempInstance = new InspectorClass();
    return tempInstance.getInspectorInfo();
  } catch (error) {

    return null;
  }
}

module.exports = {
  BaseInspector,
  InspectorRegistry,
  registry,
  createInspector,
  getInspector,
  getSupportedServiceTypes,
  getInspectorInfoList,
  getInspectorInfo,
  isServiceTypeSupported
};