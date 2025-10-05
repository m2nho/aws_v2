/**
 * WebSocket 연결 검증 및 안정성 테스트
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

const WebSocket = require('ws');
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../app');
const webSocketService = require('../services/websocketService');
const config = require('../config');

describe('WebSocket 연결 검증 및 안정성 테스트', () => {
  let server;
  let testPort;
  let validToken;
  let invalidToken;

  beforeAll(async () => {
    // 테스트용 서버 시작
    testPort = 5001; // 다른 포트 사용
    server = http.createServer(app);
    webSocketService.initialize(server);
    
    await new Promise((resolve) => {
      server.listen(testPort, resolve);
    });

    // 테스트용 토큰 생성
    validToken = jwt.sign(
      { userId: 'test-user-123', email: 'test@example.com' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    invalidToken = 'invalid.token.here';
  });

  afterAll(async () => {
    webSocketService.shutdown();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  describe('Requirement 7.1: 연결 상태 검증 및 인증 확인', () => {
    test('유효한 토큰으로 WebSocket 연결이 성공해야 함', (done) => {
      const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);
      
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'connection_established') {
          expect(message.data.connectionId).toBeDefined();
          expect(message.data.timestamp).toBeDefined();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    test('유효하지 않은 토큰으로 WebSocket 연결이 거부되어야 함', (done) => {
      const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${invalidToken}`);
      
      ws.on('open', () => {
        done(new Error('Invalid token should not allow connection'));
      });

      ws.on('error', (error) => {
        expect(error.message).toContain('Unexpected server response');
        done();
      });
    });

    test('토큰 없이 WebSocket 연결이 거부되어야 함', (done) => {
      const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections`);
      
      ws.on('open', () => {
        done(new Error('Connection without token should be rejected'));
      });

      ws.on('error', (error) => {
        expect(error.message).toContain('Unexpected server response');
        done();
      });
    });
  });

  describe('Requirement 7.2: 실시간 업데이트 안정성', () => {
    let ws;

    beforeEach((done) => {
      ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);
      ws.on('open', () => done());
      ws.on('error', done);
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    test('검사 구독 및 진행률 업데이트 수신', (done) => {
      const inspectionId = 'test-inspection-' + Date.now();
      let subscriptionConfirmed = false;

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'connection_established') {
          // 검사 구독
          ws.send(JSON.stringify({
            type: 'subscribe_inspection',
            payload: { inspectionId }
          }));
        } else if (message.type === 'subscription_confirmed') {
          expect(message.data.inspectionId).toBe(inspectionId);
          subscriptionConfirmed = true;
          
          // 진행률 업데이트 시뮬레이션
          webSocketService.broadcastProgressUpdate(inspectionId, {
            progress: {
              currentStep: 'Testing Step',
              completedSteps: 1,
              totalSteps: 5,
              percentage: 20
            }
          });
        } else if (message.type === 'progress_update') {
          expect(subscriptionConfirmed).toBe(true);
          expect(message.data.inspectionId).toBe(inspectionId);
          expect(message.data.progress.percentage).toBe(20);
          done();
        }
      });
    });

    test('상태 변경 업데이트 수신', (done) => {
      const inspectionId = 'test-status-' + Date.now();

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'connection_established') {
          ws.send(JSON.stringify({
            type: 'subscribe_inspection',
            payload: { inspectionId }
          }));
        } else if (message.type === 'subscription_confirmed') {
          webSocketService.broadcastStatusChange(inspectionId, {
            status: 'IN_PROGRESS',
            message: 'Inspection started'
          });
        } else if (message.type === 'status_change') {
          expect(message.data.inspectionId).toBe(inspectionId);
          expect(message.data.status).toBe('IN_PROGRESS');
          done();
        }
      });
    });
  });

  describe('Requirement 7.3: 검사 완료 시 구독 정리', () => {
    let ws;

    beforeEach((done) => {
      ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);
      ws.on('open', () => done());
      ws.on('error', done);
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    test('검사 완료 시 자동 구독 해제', (done) => {
      const inspectionId = 'test-complete-' + Date.now();

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'connection_established') {
          ws.send(JSON.stringify({
            type: 'subscribe_inspection',
            payload: { inspectionId }
          }));
        } else if (message.type === 'subscription_confirmed') {
          // 검사 완료 브로드캐스트
          webSocketService.broadcastInspectionComplete(inspectionId, {
            status: 'COMPLETED',
            duration: 5000,
            results: { summary: 'Test completed' }
          });
        } else if (message.type === 'inspection_complete') {
          expect(message.data.inspectionId).toBe(inspectionId);
          expect(message.data.status).toBe('COMPLETED');
          
          // 구독이 정리되었는지 확인 (1분 후)
          setTimeout(() => {
            const stats = webSocketService.getConnectionStats();
            expect(stats.inspectionStats[inspectionId]).toBeUndefined();
            done();
          }, 100); // 테스트에서는 짧은 시간으로 설정
        }
      });
    });
  });

  describe('Requirement 7.4: 클라이언트 연결 종료 시 리소스 정리', () => {
    test('클라이언트 연결 종료 시 구독 정리', (done) => {
      const inspectionId = 'test-disconnect-' + Date.now();
      const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'subscribe_inspection',
          payload: { inspectionId }
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'subscription_confirmed') {
          // 연결 상태 확인
          const statsBefore = webSocketService.getConnectionStats();
          expect(statsBefore.inspectionStats[inspectionId]).toBe(1);
          
          // 연결 종료
          ws.close();
          
          // 정리 확인
          setTimeout(() => {
            const statsAfter = webSocketService.getConnectionStats();
            expect(statsAfter.inspectionStats[inspectionId]).toBeUndefined();
            done();
          }, 100);
        }
      });
    });
  });

  describe('Requirement 7.5: 서버 graceful shutdown', () => {
    test('서버 종료 시 모든 연결이 정리되어야 함', async () => {
      // 새로운 서버 인스턴스 생성
      const testServer = http.createServer(app);
      const testWsService = require('../services/websocketService');
      testWsService.initialize(testServer);
      
      const testServerPort = 5002;
      await new Promise((resolve) => {
        testServer.listen(testServerPort, resolve);
      });

      // 여러 클라이언트 연결
      const clients = [];
      for (let i = 0; i < 3; i++) {
        const ws = new WebSocket(`ws://localhost:${testServerPort}/ws/inspections?token=${validToken}`);
        clients.push(ws);
        await new Promise((resolve) => {
          ws.on('open', resolve);
        });
      }

      // 연결 상태 확인
      expect(clients.length).toBe(3);
      clients.forEach(ws => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
      });

      // 서버 종료
      testWsService.shutdown();
      await new Promise((resolve) => {
        testServer.close(resolve);
      });

      // 모든 연결이 종료되었는지 확인
      await new Promise((resolve) => setTimeout(resolve, 100));
      clients.forEach(ws => {
        expect(ws.readyState).toBe(WebSocket.CLOSED);
      });
    });
  });

  describe('Requirement 7.6: 자동 재연결 및 오류 처리', () => {
    test('Ping/Pong 메커니즘 테스트', (done) => {
      const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);

      ws.on('open', () => {
        // Ping 메시지 전송
        ws.send(JSON.stringify({
          type: 'ping',
          timestamp: Date.now()
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'pong') {
          expect(message.timestamp).toBeDefined();
          ws.close();
          done();
        }
      });
    });

    test('잘못된 메시지 형식 처리', (done) => {
      const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);

      ws.on('open', () => {
        // 잘못된 JSON 전송
        ws.send('invalid json message');
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'error') {
          expect(message.data.code).toBe('MESSAGE_PARSE_ERROR');
          ws.close();
          done();
        }
      });
    });
  });

  describe('Requirement 7.7: 비정상적인 연결 상태 감지 및 정리', () => {
    test('연결 통계 정보 확인', () => {
      const stats = webSocketService.getConnectionStats();
      
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('totalUsers');
      expect(stats).toHaveProperty('totalInspections');
      expect(stats).toHaveProperty('inspectionStats');
      expect(stats).toHaveProperty('timestamp');
      expect(typeof stats.totalConnections).toBe('number');
    });

    test('중복 구독 방지', (done) => {
      const inspectionId = 'test-duplicate-' + Date.now();
      const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);
      let subscriptionCount = 0;

      ws.on('open', () => {
        // 같은 검사에 두 번 구독
        ws.send(JSON.stringify({
          type: 'subscribe_inspection',
          payload: { inspectionId }
        }));
        
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'subscribe_inspection',
            payload: { inspectionId }
          }));
        }, 100);
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'subscription_confirmed') {
          subscriptionCount++;
          
          if (subscriptionCount === 2) {
            // 두 번째 구독 확인에서 alreadySubscribed 플래그 확인
            expect(message.data.alreadySubscribed).toBe(true);
            
            // 실제 구독자 수는 1이어야 함
            const stats = webSocketService.getConnectionStats();
            expect(stats.inspectionStats[inspectionId]).toBe(1);
            
            ws.close();
            done();
          }
        }
      });
    });
  });
});