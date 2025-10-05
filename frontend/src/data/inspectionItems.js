// AWS 서비스별 검사 항목 정의
export const inspectionItems = {
  EC2: {
    id: 'EC2',
    name: 'Amazon EC2',
    description: 'EC2 인스턴스, 보안 그룹, 네트워킹 구성을 검사합니다',
    icon: '🖥️',
    color: '#FF9900',
    categories: [
      {
        id: 'security',
        name: '보안',
        description: 'EC2 보안 설정 및 접근 제어 검사',
        items: [
          {
            id: 'security_groups',
            name: '보안 그룹 규칙',
            description: '과도한 권한이나 불필요한 포트 개방을 검사합니다',
            severity: 'HIGH',
            enabled: true
          },
          {
            id: 'security_group_management',
            name: '보안 그룹 관리',
            description: '보안 그룹 설명, 명명 규칙, 관리 상태를 검사합니다',
            severity: 'LOW',
            enabled: false
          },
          {
            id: 'key_pairs',
            name: '키 페어 관리',
            description: '사용되지 않는 키 페어나 보안 위험을 검사합니다',
            severity: 'MEDIUM',
            enabled: true
          },
          {
            id: 'instance_metadata',
            name: '인스턴스 메타데이터 서비스',
            description: 'IMDSv2 사용 여부 및 메타데이터 보안 설정을 검사합니다',
            severity: 'HIGH',
            enabled: true
          }
        ]
      },
      {
        id: 'performance',
        name: '성능',
        description: 'EC2 인스턴스 성능 및 최적화 검사',
        items: [
          {
            id: 'instance_types',
            name: '인스턴스 타입 최적화',
            description: '워크로드에 적합한 인스턴스 타입 사용 여부를 검사합니다',
            severity: 'MEDIUM',
            enabled: false
          },
          {
            id: 'ebs_optimization',
            name: 'EBS 최적화',
            description: 'EBS 볼륨 타입 및 성능 설정을 검사합니다',
            severity: 'LOW',
            enabled: false
          }
        ]
      },
      {
        id: 'cost',
        name: '비용 최적화',
        description: 'EC2 비용 최적화 기회 검사',
        items: [
          {
            id: 'unused_instances',
            name: '미사용 인스턴스',
            description: '장기간 사용되지 않는 인스턴스를 검사합니다',
            severity: 'MEDIUM',
            enabled: false
          },
          {
            id: 'reserved_instances',
            name: '예약 인스턴스 기회',
            description: '예약 인스턴스로 비용 절약 가능한 인스턴스를 검사합니다',
            severity: 'LOW',
            enabled: false
          }
        ]
      }
    ]
  },
  
  RDS: {
    id: 'RDS',
    name: 'Amazon RDS',
    description: 'RDS 데이터베이스 보안, 백업, 성능을 검사합니다',
    icon: '🗄️',
    color: '#3F48CC',
    categories: [
      {
        id: 'security',
        name: '보안',
        description: 'RDS 보안 설정 및 암호화 검사',
        items: [
          {
            id: 'encryption',
            name: '암호화 설정',
            description: '저장 시 암호화 및 전송 중 암호화 설정을 검사합니다',
            severity: 'HIGH',
            enabled: true
          },
          {
            id: 'security_groups',
            name: '데이터베이스 보안 그룹',
            description: '데이터베이스 접근 권한 및 네트워크 보안을 검사합니다',
            severity: 'HIGH',
            enabled: true
          },
          {
            id: 'public_access',
            name: '퍼블릭 접근 설정',
            description: '불필요한 퍼블릭 접근 허용 여부를 검사합니다',
            severity: 'CRITICAL',
            enabled: true
          }
        ]
      },
      {
        id: 'backup',
        name: '백업 및 복구',
        description: 'RDS 백업 정책 및 복구 설정 검사',
        items: [
          {
            id: 'automated_backup',
            name: '자동 백업',
            description: '자동 백업 활성화 및 보존 기간을 검사합니다',
            severity: 'HIGH',
            enabled: true
          },
          {
            id: 'snapshot_encryption',
            name: '스냅샷 암호화',
            description: '데이터베이스 스냅샷 암호화 설정을 검사합니다',
            severity: 'MEDIUM',
            enabled: false
          }
        ]
      }
    ]
  },

  S3: {
    id: 'S3',
    name: 'Amazon S3',
    description: 'S3 버킷 보안, 정책, 비용 최적화를 검사합니다',
    icon: '🪣',
    color: '#569A31',
    categories: [
      {
        id: 'security',
        name: '보안',
        description: 'S3 버킷 보안 설정 및 접근 제어 검사',
        items: [
          {
            id: 'bucket_policy',
            name: '버킷 정책',
            description: '버킷 정책의 보안 위험 요소를 검사합니다',
            severity: 'HIGH',
            enabled: true
          },
          {
            id: 'public_access',
            name: '퍼블릭 접근 차단',
            description: '의도하지 않은 퍼블릭 접근을 검사합니다',
            severity: 'CRITICAL',
            enabled: true
          },
          {
            id: 'encryption',
            name: '서버 측 암호화',
            description: 'S3 객체 암호화 설정을 검사합니다',
            severity: 'HIGH',
            enabled: true
          }
        ]
      },
      {
        id: 'compliance',
        name: '규정 준수',
        description: 'S3 규정 준수 및 거버넌스 검사',
        items: [
          {
            id: 'versioning',
            name: '버전 관리',
            description: '버킷 버전 관리 활성화 여부를 검사합니다',
            severity: 'MEDIUM',
            enabled: false
          },
          {
            id: 'mfa_delete',
            name: 'MFA 삭제',
            description: 'MFA 삭제 보호 설정을 검사합니다',
            severity: 'MEDIUM',
            enabled: false
          }
        ]
      }
    ]
  },

  IAM: {
    id: 'IAM',
    name: 'AWS IAM',
    description: 'IAM 사용자, 역할, 정책의 보안을 검사합니다',
    icon: '👤',
    color: '#FF4B4B',
    categories: [
      {
        id: 'security',
        name: '보안',
        description: 'IAM 보안 설정 및 접근 제어 검사',
        items: [
          {
            id: 'root_access_key',
            name: '루트 계정 액세스 키',
            description: '루트 계정의 액세스 키 사용 여부를 검사합니다',
            severity: 'CRITICAL',
            enabled: true
          },
          {
            id: 'mfa_enabled',
            name: 'MFA 활성화',
            description: '사용자 계정의 MFA 활성화 여부를 검사합니다',
            severity: 'HIGH',
            enabled: true
          },
          {
            id: 'unused_credentials',
            name: '미사용 자격 증명',
            description: '장기간 사용되지 않는 액세스 키를 검사합니다',
            severity: 'MEDIUM',
            enabled: true
          }
        ]
      },
      {
        id: 'policies',
        name: '정책 관리',
        description: 'IAM 정책 및 권한 검사',
        items: [
          {
            id: 'overprivileged_policies',
            name: '과도한 권한',
            description: '필요 이상의 권한을 가진 정책을 검사합니다',
            severity: 'HIGH',
            enabled: false
          },
          {
            id: 'inline_policies',
            name: '인라인 정책',
            description: '관리되지 않는 인라인 정책 사용을 검사합니다',
            severity: 'MEDIUM',
            enabled: false
          }
        ]
      }
    ]
  }
};

// 심각도별 색상 정의
export const severityColors = {
  CRITICAL: '#DC2626',
  HIGH: '#EA580C',
  MEDIUM: '#D97706',
  LOW: '#65A30D'
};

// 심각도별 아이콘
export const severityIcons = {
  CRITICAL: '🚨',
  HIGH: '⚠️',
  MEDIUM: '⚡',
  LOW: 'ℹ️'
};