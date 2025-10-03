/**
 * InspectionHistory vs InspectionItemResults 테이블 역할 분석
 */

console.log('=== 현재 두 테이블의 역할 분석 ===\n');

console.log('📊 InspectionHistory 테이블:');
console.log('  목적: 검사 전체의 메타데이터와 결과 저장');
console.log('  구조: customerId + inspectionId');
console.log('  데이터:');
console.log('    - 검사 ID, 서비스 타입, 상태');
console.log('    - 시작/종료 시간, 소요 시간');
console.log('    - 전체 검사 결과 (findings 배열)');
console.log('    - 요약 통계 (총 리소스, 위험도별 개수)');
console.log('    - 메타데이터 (검사 버전, Role ARN 등)');
console.log('');

console.log('🔍 InspectionItemResults 테이블:');
console.log('  목적: 검사 항목별 최신 상태 저장 (Trust Advisor 스타일)');
console.log('  구조: customerId + itemKey (serviceType#itemId)');
console.log('  데이터:');
console.log('    - 검사 항목 정보 (이름, 카테고리)');
console.log('    - 최신 검사 결과 (상태, 점수, 문제 수)');
console.log('    - 해당 항목의 findings');
console.log('    - 마지막 검사 ID와 시간');
console.log('');

console.log('🤔 문제점 분석:');
console.log('  1. 데이터 중복:');
console.log('     - findings가 양쪽 테이블에 모두 저장됨');
console.log('     - 검사 메타데이터가 중복됨');
console.log('');
console.log('  2. 역할 혼재:');
console.log('     - InspectionHistory: 검사별 + 항목별 정보 혼재');
console.log('     - InspectionItemResults: 최신 상태만 저장 (히스토리 없음)');
console.log('');
console.log('  3. 복잡한 동기화:');
console.log('     - 두 테이블 간 데이터 일관성 유지 어려움');
console.log('     - 트랜잭션 복잡성 증가');
console.log('');

console.log('💡 단일 테이블 구조의 장점:');
console.log('  1. 단순성:');
console.log('     - 하나의 데이터 소스');
console.log('     - 트랜잭션 복잡성 제거');
console.log('     - 데이터 일관성 보장');
console.log('');
console.log('  2. 유연성:');
console.log('     - recordType으로 용도 구분');
console.log('     - LATEST: 최신 상태 (리소스 검사 탭)');
console.log('     - HISTORY: 모든 기록 (검사 히스토리)');
console.log('');
console.log('  3. 성능:');
console.log('     - 단일 테이블 쿼리');
console.log('     - 조인 불필요');
console.log('     - GSI 활용으로 효율적 필터링');
console.log('');

console.log('🎯 권장 단일 테이블 구조:');
console.log('');
console.log('  테이블명: InspectionRecords');
console.log('  Primary Key: customerId + recordKey');
console.log('');
console.log('  recordKey 패턴:');
console.log('    - LATEST#{serviceType}#{itemId}');
console.log('    - HISTORY#{serviceType}#{itemId}#{inspectionId}');
console.log('    - BATCH#{inspectionId} (검사 메타데이터용)');
console.log('');
console.log('  GSI:');
console.log('    - customerId-recordType-index');
console.log('    - customerId-serviceType-index');
console.log('    - customerId-timestamp-index');
console.log('');

console.log('📋 사용 패턴:');
console.log('  리소스 검사 탭:');
console.log('    → recordType = "LATEST" 필터');
console.log('    → 각 검사 항목의 최신 상태만 조회');
console.log('');
console.log('  검사 히스토리:');
console.log('    → recordType = "HISTORY" 필터');
console.log('    → 모든 검사 기록을 시간순으로 조회');
console.log('');
console.log('  검사 메타데이터:');
console.log('    → recordType = "BATCH" 필터');
console.log('    → 검사 전체 정보 (시작/종료 시간, 배치 정보 등)');
console.log('');

console.log('✅ 결론: 단일 테이블 구조 강력 권장');
console.log('  - 현재 두 테이블의 역할이 명확하지 않음');
console.log('  - 데이터 중복과 동기화 문제 해결');
console.log('  - 더 단순하고 효율적인 구조');
console.log('  - 모든 요구사항을 만족하면서 복잡성 대폭 감소');