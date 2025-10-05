#!/usr/bin/env node

/**
 * WebSocket 연결 및 기능 테스트 스크립트
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('../config');

class WebSocketTester {
  constructor() {
    this.testResults = [];
    this.activeConnections = [];
  }

  log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    console.log(logMessage);
    
    this.testResults.push({
      timestamp,
      type,
      message,
      success: type !== 'ERROR'
    });
  }

  async runAllTests() {
    this.log('🚀 WebSocket 테스트 시작');
    
    try {
      await this.testBasicConnection();
      await this.testAuthentication();
      await this.testSubscriptionFlow();
      await this.testProgressUpdates();
      await this.testConnectionCleanup();
      await this.testErrorHandling();
      await this.testConcurrentConnections();
      
      this.generateReport();
      
    } catch (error) {
      this.log(`테스트 실행 중 오류: ${error.message}`, 'ERROR');
    } finally {
      await this.cleanup();
    }
  }

  async testBasicConnection() {
    this.log('📡 기본 연결 테스트 시작');
    
    const token = this.generateTestToken();
    const ws = await this.createConnection(token);
    
    if (ws) {
      this.log('✅ 기본 연결 성공');
      ws.close();
    } else {
      this.log('❌ 기본 연결 실패', 'ERROR');
    }
  }

  async testAuthentication() {
    this.log('🔐 인증 테스트 시작');
    
    // 유효한 토큰 테스트
    const validToken = this.generateTestToken();
    const validWs = await this.createConnection(validToken);
    
    if (validWs) {
      this.log('✅ 유효한 토큰으로 연결 성공');
      validWs.close();
    } else {
      this.log('❌ 유효한 토큰 연결 실패', 'ERROR');
    }

    // 무효한 토큰 테스트
    try {
      const invalidWs = await this.createConnection('invalid.token');
      if (invalidWs) {
        this.log('❌ 무효한 토큰으로 연결 성공 (보안 문제)', 'ERROR');
        invalidWs.close();
      }
    } catch (error) {
      this.log('✅ 무효한 토큰 연결 거부됨');
    }

    // 토큰 없이 연결 테스트
    try {
      const noTokenWs = await this.createConnection(null);
      if (noTokenWs) {
        this.log('❌ 토큰 없이 연결 성공 (보안 문제)', 'ERROR');
        noTokenWs.close();
      }
    } catch (error) {
      this.log('✅ 토큰 없는 연결 거부됨');
    }
  }

  async testSubscriptionFlow() {
    this.log('📋 구독 플로우 테스트 시작');
    
    const token = this.generateTestToken();
    const ws = await this.createConnection(token);
    
    if (!ws) {
      this.log('❌ 연결 실패로 구독 테스트 불가', 'ERROR');
      return;
    }

    const inspectionId = `test-inspection-${Date.now()}`;
    
    // 구독 테스트
    const subscriptionPromise = new Promise((resolve) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'subscription_confirmed' && 
            message.data.inspectionId === inspectionId) {
          this.log('✅ 구독 확인 메시지 수신');
          resolve(true);
        }
      });
    });

    ws.send(JSON.stringify({
      type: 'subscribe_inspection',
      payload: { inspectionId }
    }));

    await subscriptionPromise;

    // 구독 해제 테스트
    const unsubscriptionPromise = new Promise((resolve) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'unsubscription_confirmed' && 
            message.data.inspectionId === inspectionId) {
          this.log('✅ 구독 해제 확인 메시지 수신');
          resolve(true);
        }
      });
    });

    ws.send(JSON.stringify({
      type: 'unsubscribe_inspection',
      payload: { inspectionId }
    }));

    await unsubscriptionPromise;
    ws.close();
  }

  async testProgressUpdates() {
    this.log('📊 진행률 업데이트 테스트 시작');
    
    const token = this.generateTestToken();
    const ws = await this.createConnection(token);
    
    if (!ws) {
      this.log('❌ 연결 실패로 진행률 테스트 불가', 'ERROR');
      return;
    }

    const inspectionId = `progress-test-${Date.now()}`;
    
    // 구독 후 진행률 업데이트 시뮬레이션
    ws.on('message', (data) => {
      const message = JSON.parse(data);
      
      if (message.type === 'subscription_confirmed') {
        // 서버에서 진행률 업데이트를 시뮬레이션하기 위해
        // 실제로는 inspectionService에서 broadcastProgressUpdate를 호출해야 함
        this.log('📈 진행률 업데이트 시뮬레이션 준비');
      } else if (message.type === 'progress_update') {
        this.log('✅ 진행률 업데이트 수신');
      }
    });

    ws.send(JSON.stringify({
      type: 'subscribe_inspection',
      payload: { inspectionId }
    }));

    // 잠시 대기 후 연결 종료
    setTimeout(() => {
      ws.close();
    }, 1000);
  }

  async testConnectionCleanup() {
    this.log('🧹 연결 정리 테스트 시작');
    
    const token = this.generateTestToken();
    const connections = [];
    
    // 여러 연결 생성
    for (let i = 0; i < 5; i++) {
      const ws = await this.createConnection(token);
      if (ws) {
        connections.push(ws);
      }
    }

    this.log(`📊 ${connections.length}개 연결 생성됨`);

    // 일부 연결 정상 종료
    connections.slice(0, 2).forEach(ws => ws.close());
    this.log('✅ 2개 연결 정상 종료');

    // 일부 연결 강제 종료
    connections.slice(2, 4).forEach(ws => ws.terminate());
    this.log('✅ 2개 연결 강제 종료');

    // 마지막 연결은 그대로 두고 나중에 정리
    if (connections[4]) {
      setTimeout(() => {
        connections[4].close();
        this.log('✅ 마지막 연결 지연 종료');
      }, 500);
    }
  }

  async testErrorHandling() {
    this.log('⚠️ 에러 처리 테스트 시작');
    
    const token = this.generateTestToken();
    const ws = await this.createConnection(token);
    
    if (!ws) {
      this.log('❌ 연결 실패로 에러 테스트 불가', 'ERROR');
      return;
    }

    // 잘못된 JSON 전송
    try {
      ws.send('invalid json message');
      this.log('📤 잘못된 JSON 메시지 전송');
    } catch (error) {
      this.log('✅ 잘못된 메시지 전송 시 에러 처리됨');
    }

    // 알 수 없는 메시지 타입 전송
    ws.send(JSON.stringify({
      type: 'unknown_message_type',
      payload: { test: 'data' }
    }));
    this.log('📤 알 수 없는 메시지 타입 전송');

    // 필수 필드 누락 메시지 전송
    ws.send(JSON.stringify({
      type: 'subscribe_inspection',
      payload: {} // inspectionId 누락
    }));
    this.log('📤 필수 필드 누락 메시지 전송');

    setTimeout(() => {
      ws.close();
    }, 500);
  }

  async testConcurrentConnections() {
    this.log('🔄 동시 연결 테스트 시작');
    
    const token = this.generateTestToken();
    const connectionPromises = [];
    
    // 10개의 동시 연결 시도
    for (let i = 0; i < 10; i++) {
      connectionPromises.push(this.createConnection(token));
    }

    const connections = await Promise.all(connectionPromises);
    const successfulConnections = connections.filter(ws => ws !== null);
    
    this.log(`📊 ${successfulConnections.length}/10 동시 연결 성공`);

    // 모든 연결에서 동시에 구독
    const subscriptionPromises = successfulConnections.map((ws, index) => {
      return new Promise((resolve) => {
        const inspectionId = `concurrent-test-${index}-${Date.now()}`;
        
        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'subscription_confirmed') {
            resolve(true);
          }
        });

        ws.send(JSON.stringify({
          type: 'subscribe_inspection',
          payload: { inspectionId }
        }));
      });
    });

    await Promise.all(subscriptionPromises);
    this.log('✅ 모든 동시 연결에서 구독 성공');

    // 모든 연결 정리
    successfulConnections.forEach(ws => ws.close());
    this.log('✅ 모든 동시 연결 정리 완료');
  }

  async createConnection(token) {
    return new Promise((resolve, reject) => {
      const wsUrl = token 
        ? `ws://localhost:5000/ws/inspections?token=${encodeURIComponent(token)}`
        : `ws://localhost:5000/ws/inspections`;
      
      const ws = new WebSocket(wsUrl);
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        this.activeConnections.push(ws);
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      ws.on('close', () => {
        const index = this.activeConnections.indexOf(ws);
        if (index > -1) {
          this.activeConnections.splice(index, 1);
        }
      });
    });
  }

  generateTestToken() {
    return jwt.sign(
      { 
        userId: `test-user-${Date.now()}`, 
        email: 'test@example.com' 
      },
      config.jwt.secret,
      { expiresIn: '1h' }
    );
  }

  generateReport() {
    this.log('📋 테스트 결과 리포트 생성');
    
    const totalTests = this.testResults.length;
    const successfulTests = this.testResults.filter(r => r.success).length;
    const failedTests = totalTests - successfulTests;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 WebSocket 테스트 결과 요약');
    console.log('='.repeat(60));
    console.log(`총 테스트: ${totalTests}`);
    console.log(`성공: ${successfulTests}`);
    console.log(`실패: ${failedTests}`);
    console.log(`성공률: ${((successfulTests / totalTests) * 100).toFixed(1)}%`);
    console.log('='.repeat(60));
    
    if (failedTests > 0) {
      console.log('\n❌ 실패한 테스트:');
      this.testResults
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  - ${r.message}`);
        });
    }
    
    console.log('\n✅ 테스트 완료');
  }

  async cleanup() {
    this.log('🧹 테스트 정리 중...');
    
    // 모든 활성 연결 정리
    this.activeConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    
    this.activeConnections = [];
    this.log('✅ 모든 연결 정리 완료');
  }
}

// 스크립트 실행
if (require.main === module) {
  const tester = new WebSocketTester();
  
  process.on('SIGINT', async () => {
    console.log('\n🛑 테스트 중단됨');
    await tester.cleanup();
    process.exit(0);
  });
  
  tester.runAllTests().catch(error => {
    console.error('테스트 실행 오류:', error);
    process.exit(1);
  });
}

module.exports = WebSocketTester;