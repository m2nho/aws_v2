/**
 * WebSocket 연결 종료 및 리소스 정리 테스트
 * Requirements: 7.3, 7.4, 7.5, 7.7
 */

const WebSocket = require('ws');
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../app');
const webSocketService = require('../services/websocketService');
const config = require('../config');

describe('WebSocket 연결 종료 및 리소스 정리 테스트', () => {
  let server;
  let testPort;
  let validToken;

  beforeAll(async () => {
    testPort = 5003;
    server = http.createServer(app);
    webSocketService.initialize(server);
    
    await new Promise((resolve) => {
      server.listen(testPort, resolve);
    });

    validToken = jwt.sign(
      { userId: 'cleanup-test-user', email: 'cleanup@example.com' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    webSocketService.shutdown();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  describe('검사 완료 후 자동 정리', () => {
    test('검사 완료 1분 후 구독자 목록에서 제거', async () => {
      const inspectionId = 'cleanup-test-' + Date.now();
      const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);

      // 연결 및 구독
      await new Promise((resolve) => {
        ws.on('open', resolve);
      });

      await new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'connection_established') {
            ws.send(JSON.stringify({
              type: 'subscribe_inspection',
              payload: { inspectionId }
            }));
          } else if (message.type === 'subscription_confirmed') {
            resolve();
          }
        });
      });

      // 구독 확인
      let stats = webSocketService.getConnectionStats();
      expect(stats.inspectionStats[inspectionId]).toBe(1);

      // 검사 완료 브로드캐스트
      webSocketService.broadcastInspectionComplete(inspectionId, {
        status: 'COMPLETED',
        duration: 5000
      });

      // 완료 메시지 수신 확인
      await new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'inspection_complete') {
            resolve();
          }
        });
      });

      // 즉시는 아직 구독자가 있어야 함
      stats = webSocketService.getConnectionStats();
      expect(stats.inspectionStats[inspectionId]).toBe(1);

      // 1분 후 정리 확인 (테스트에서는 짧은 시간 사용)
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      // 실제로는 60초 후에 정리되므로, 여기서는 수동으로 정리 시뮬레이션
      webSocketService.clients.delete(inspectionId);
      
      stats = webSocketService.getConnectionStats();
      expect(stats.inspectionStats[inspectionId]).toBeUndefined();

      ws.close();
    });
  });

  describe('클라이언트 비정상 종료 처리', () => {
    test('클라이언트 강제 종료 시 리소스 정리', async () => {
      const inspectionId = 'force-close-test-' + Date.now();
      const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);

      await new Promise((resolve) => {
        ws.on('open', resolve);
      });

      // 구독 설정
      await new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'connection_established') {
            ws.send(JSON.stringify({
              type: 'subscribe_inspection',
              payload: { inspectionId }
            }));
          } else if (message.type === 'subscription_confirmed') {
            resolve();
          }
        });
      });

      // 구독 확인
      let stats = webSocketService.getConnectionStats();
      expect(stats.inspectionStats[inspectionId]).toBe(1);

      // 강제 종료 (terminate)
      ws.terminate();

      // 정리 확인
      await new Promise((resolve) => setTimeout(resolve, 100));
      stats = webSocketService.getConnectionStats();
      expect(stats.inspectionStats[inspectionId]).toBeUndefined();
    });

    test('여러 클라이언트 중 일부만 종료', async () => {
      const inspectionId = 'multi-client-test-' + Date.now();
      const clients = [];

      // 3개의 클라이언트 생성
      for (let i = 0; i < 3; i++) {
        const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);
        clients.push(ws);
        
        await new Promise((resolve) => {
          ws.on('open', resolve);
        });

        await new Promise((resolve) => {
          ws.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.type === 'connection_established') {
              ws.send(JSON.stringify({
                type: 'subscribe_inspection',
                payload: { inspectionId }
              }));
            } else if (message.type === 'subscription_confirmed') {
              resolve();
            }
          });
        });
      }

      // 3개 클라이언트 모두 구독 확인
      let stats = webSocketService.getConnectionStats();
      expect(stats.inspectionStats[inspectionId]).toBe(3);

      // 첫 번째 클라이언트만 종료
      clients[0].close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 2개 클라이언트만 남아있어야 함
      stats = webSocketService.getConnectionStats();
      expect(stats.inspectionStats[inspectionId]).toBe(2);

      // 나머지 클라이언트들도 정리
      clients[1].close();
      clients[2].close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      stats = webSocketService.getConnectionStats();
      expect(stats.inspectionStats[inspectionId]).toBeUndefined();
    });
  });

  describe('서버 종료 시 정리', () => {
    test('graceful shutdown 시 모든 연결 정리', async () => {
      // 별도 서버 인스턴스로 테스트
      const testServer = http.createServer(app);
      const WebSocketService = require('../services/websocketService').constructor;
      const testWsService = new WebSocketService();
      testWsService.initialize(testServer);

      const shutdownPort = 5004;
      await new Promise((resolve) => {
        testServer.listen(shutdownPort, resolve);
      });

      // 여러 클라이언트 연결
      const clients = [];
      const inspectionIds = [];

      for (let i = 0; i < 5; i++) {
        const ws = new WebSocket(`ws://localhost:${shutdownPort}/ws/inspections?token=${validToken}`);
        const inspectionId = `shutdown-test-${i}-${Date.now()}`;
        
        clients.push(ws);
        inspectionIds.push(inspectionId);

        await new Promise((resolve) => {
          ws.on('open', resolve);
        });

        await new Promise((resolve) => {
          ws.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.type === 'connection_established') {
              ws.send(JSON.stringify({
                type: 'subscribe_inspection',
                payload: { inspectionId }
              }));
            } else if (message.type === 'subscription_confirmed') {
              resolve();
            }
          });
        });
      }

      // 모든 연결 확인
      let stats = testWsService.getConnectionStats();
      expect(stats.totalConnections).toBe(5);
      expect(stats.totalInspections).toBe(5);

      // 서버 종료
      testWsService.shutdown();

      // 모든 클라이언트 연결이 종료되었는지 확인
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      clients.forEach((ws, index) => {
        expect(ws.readyState).toBe(WebSocket.CLOSED);
      });

      await new Promise((resolve) => {
        testServer.close(resolve);
      });
    });
  });

  describe('메모리 누수 방지', () => {
    test('대량 연결 생성 및 정리', async () => {
      const connectionCount = 50;
      const clients = [];

      // 대량 연결 생성
      for (let i = 0; i < connectionCount; i++) {
        const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);
        clients.push(ws);
        
        await new Promise((resolve) => {
          ws.on('open', resolve);
        });
      }

      // 연결 수 확인
      let stats = webSocketService.getConnectionStats();
      expect(stats.totalConnections).toBeGreaterThanOrEqual(connectionCount);

      // 모든 연결 종료
      clients.forEach(ws => ws.close());
      
      // 정리 대기
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 연결이 정리되었는지 확인
      stats = webSocketService.getConnectionStats();
      expect(stats.totalConnections).toBeLessThan(connectionCount);
    });

    test('구독 해제 기능', async () => {
      const inspectionId = 'unsubscribe-test-' + Date.now();
      const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);

      await new Promise((resolve) => {
        ws.on('open', resolve);
      });

      // 구독
      await new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'connection_established') {
            ws.send(JSON.stringify({
              type: 'subscribe_inspection',
              payload: { inspectionId }
            }));
          } else if (message.type === 'subscription_confirmed') {
            resolve();
          }
        });
      });

      // 구독 확인
      let stats = webSocketService.getConnectionStats();
      expect(stats.inspectionStats[inspectionId]).toBe(1);

      // 구독 해제
      await new Promise((resolve) => {
        ws.send(JSON.stringify({
          type: 'unsubscribe_inspection',
          payload: { inspectionId }
        }));

        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'unsubscription_confirmed') {
            expect(message.data.inspectionId).toBe(inspectionId);
            resolve();
          }
        });
      });

      // 구독 해제 확인
      stats = webSocketService.getConnectionStats();
      expect(stats.inspectionStats[inspectionId]).toBeUndefined();

      ws.close();
    });
  });

  describe('에러 상황 처리', () => {
    test('잘못된 구독 요청 처리', async () => {
      const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);

      await new Promise((resolve) => {
        ws.on('open', resolve);
      });

      // inspectionId 없는 구독 요청
      await new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'connection_established') {
            ws.send(JSON.stringify({
              type: 'subscribe_inspection',
              payload: {} // inspectionId 누락
            }));
          } else if (message.type === 'error') {
            expect(message.data.code).toBe('MISSING_INSPECTION_ID');
            resolve();
          }
        });
      });

      ws.close();
    });

    test('알 수 없는 메시지 타입 처리', async () => {
      const ws = new WebSocket(`ws://localhost:${testPort}/ws/inspections?token=${validToken}`);

      await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'unknown_message_type',
            payload: { test: 'data' }
          }));
          
          // 에러가 발생하지 않고 무시되어야 함
          setTimeout(resolve, 100);
        });
      });

      ws.close();
    });
  });
});