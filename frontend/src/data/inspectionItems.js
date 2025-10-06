// AWS 서비스별 검사 항목 정의
export const inspectionItems = {
  EC2: {
    id: 'EC2',
    name: 'Amazon EC2',
    description: 'EC2 인스턴스 보안, 구성, 비용 최적화를 검사합니다',
    icon: '🖥️',
    color: '#FF9900',
    categories: [
      {
        id: 'security',
        name: '보안',
        description: 'EC2 보안 설정 및 접근 제어 검사',
        items: [
          {
            id: 'dangerous_ports',
            name: '위험한 포트 보안',
            description: 'SSH, RDP, 데이터베이스 포트 등의 인터넷 노출을 검사합니다',
            severity: 'CRITICAL',
            enabled: true
          },
          {
            id: 'ebs_encryption',
            name: 'EBS 볼륨 암호화',
            description: '암호화되지 않은 EBS 볼륨과 스냅샷을 검사합니다',
            severity: 'HIGH',
            enabled: true
          },
          {
            id: 'public_ip_exposure',
            name: '퍼블릭 IP 노출',
            description: '인스턴스의 불필요한 퍼블릭 IP 할당을 검사합니다',
            severity: 'MEDIUM',
            enabled: true
          },
          {
            id: 'ebs_volume_version',
            name: 'EBS 볼륨 버전',
            description: '2년 이상 된 인스턴스의 구형 볼륨 타입 및 GP3 업그레이드를 검사합니다',
            severity: 'MEDIUM',
            enabled: true
          },
          {
            id: 'termination-protection',
            name: '종료 보호 설정',
            description: '중요한 인스턴스의 실수 삭제 방지를 위한 종료 보호 설정을 검사합니다',
            severity: 'MEDIUM',
            enabled: true
          }
        ]
      },
      {
        id: 'cost_optimization',
        name: '비용 최적화',
        description: '미사용 리소스 및 비용 절감 기회 검사',
        items: [
          {
            id: 'unused_security_groups',
            name: '미사용 보안 그룹',
            description: 'EC2 인스턴스에 연결되지 않은 보안 그룹을 검사합니다',
            severity: 'MEDIUM',
            enabled: true
          },
          {
            id: 'unused_elastic_ip',
            name: '미사용 Elastic IP',
            description: '중지된 인스턴스에 연결된 Elastic IP를 검사합니다',
            severity: 'MEDIUM',
            enabled: true
          },
          {
            id: 'old_snapshots',
            name: '오래된 스냅샷',
            description: '종료된 인스턴스 및 90일 이상 된 스냅샷 정리를 권장합니다',
            severity: 'LOW',
            enabled: true
          },
          {
            id: 'stopped-instances',
            name: '중지된 인스턴스',
            description: '30일 이상 중지된 인스턴스의 비용 절감 기회를 검사합니다',
            severity: 'MEDIUM',
            enabled: true
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
            id: 'root-access-key',
            name: '루트 계정 액세스 키',
            description: '루트 계정의 액세스 키 사용 여부를 검사합니다',
            severity: 'CRITICAL',
            enabled: true
          },
          {
            id: 'mfa-enabled',
            name: 'MFA 활성화',
            description: '사용자 계정의 MFA 활성화 여부를 검사합니다',
            severity: 'HIGH',
            enabled: true
          },
          {
            id: 'unused-credentials',
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
            id: 'overprivileged-user-policies',
            name: '사용자 과도한 권한',
            description: '필요 이상의 권한을 가진 사용자 정책을 검사합니다',
            severity: 'HIGH',
            enabled: true
          },
          {
            id: 'overprivileged-role-policies',
            name: '역할 과도한 권한',
            description: '필요 이상의 권한을 가진 역할 정책을 검사합니다',
            severity: 'HIGH',
            enabled: true
          },
          {
            id: 'inline-policies',
            name: '인라인 정책',
            description: '관리되지 않는 인라인 정책 사용을 검사합니다',
            severity: 'MEDIUM',
            enabled: true
          },
          {
            id: 'unused-policies',
            name: '사용되지 않는 정책',
            description: '어떤 사용자나 역할에도 연결되지 않은 정책을 검사합니다',
            severity: 'LOW',
            enabled: true
          }
        ]
      }
    ]
  },

  S3: {
    id: 'S3',
    name: 'Amazon S3',
    description: 'S3 버킷 보안, 암호화, 접근 제어를 검사합니다',
    icon: '🪣',
    color: '#569A31',
    categories: [
      {
        id: 'security',
        name: '보안',
        description: 'S3 보안 설정 및 접근 제어 검사',
        items: [
          {
            id: 'bucket-encryption',
            name: '버킷 암호화',
            description: '서버 측 암호화 설정 및 KMS 키 사용을 검사합니다',
            severity: 'HIGH',
            enabled: true
          },
          {
            id: 'bucket-public-access',
            name: '퍼블릭 액세스 차단',
            description: '버킷의 퍼블릭 액세스 차단 설정을 검사합니다',
            severity: 'CRITICAL',
            enabled: true
          },
          {
            id: 'bucket-policy',
            name: '버킷 정책',
            description: '위험한 버킷 정책 및 과도한 권한을 검사합니다',
            severity: 'HIGH',
            enabled: true
          },
          {
            id: 'bucket-cors',
            name: 'CORS 설정',
            description: '위험한 CORS 설정 및 와일드카드 사용을 검사합니다',
            severity: 'MEDIUM',
            enabled: true
          }
        ]
      },
      {
        id: 'data_protection',
        name: '데이터 보호',
        description: 'S3 데이터 보호 및 백업 설정 검사',
        items: [
          {
            id: 'bucket-versioning',
            name: '버전 관리',
            description: '버킷의 버전 관리 활성화 여부를 검사합니다',
            severity: 'MEDIUM',
            enabled: true
          },
          // {
          //   id: 'bucket-mfa-delete',
          //   name: 'MFA Delete',
          //   description: '중요한 버킷의 MFA Delete 설정을 검사합니다 (버전 관리 검사에 통합됨)',
          //   severity: 'MEDIUM',
          //   enabled: false
          // },
          {
            id: 'bucket-logging',
            name: '액세스 로깅',
            description: '버킷의 액세스 로깅 활성화 여부를 검사합니다',
            severity: 'MEDIUM',
            enabled: true
          }
        ]
      },
      {
        id: 'cost_optimization',
        name: '비용 최적화',
        description: 'S3 스토리지 비용 최적화 검사',
        items: [
          {
            id: 'bucket-lifecycle',
            name: '라이프사이클 정책',
            description: '스토리지 클래스 전환 및 객체 만료 정책을 검사합니다',
            severity: 'MEDIUM',
            enabled: true
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
  LOW: '#65A30D',
  PASS: '#16A34A'
};

// 심각도별 아이콘
export const severityIcons = {
  CRITICAL: '🚨',
  HIGH: '⚠️',
  MEDIUM: '⚡',
  LOW: 'ℹ️',
  PASS: '✅'
};