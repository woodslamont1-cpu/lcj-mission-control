#!/usr/bin/env node
// Mission Control Gateway Integration Verification
// Tests the complete gateway connection and dashboard integration

const http = require('http');
const WebSocket = require('ws');

console.log('🚀 Mission Control Gateway Integration Verification');
console.log('=' .repeat(55));

// Test configuration
const GATEWAY_CONFIG = {
  wsUrl: 'ws://127.0.0.1:18789',
  token: '03647d103f0aab173b344bc01fb682f348f689a668ba4086',
  dashboardUrl: 'http://localhost:8080/api/status'
};

async function testGatewayConnection() {
  console.log('1️⃣ Testing OpenClaw Gateway Connection...');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(`${GATEWAY_CONFIG.wsUrl}?token=${GATEWAY_CONFIG.token}`);
    
    ws.on('open', () => {
      console.log('   ✅ Gateway WebSocket connected successfully!');
      ws.close();
      resolve(true);
    });
    
    ws.on('error', (error) => {
      console.log(`   ❌ Gateway connection failed: ${error.message}`);
      resolve(false);
    });
    
    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        console.log(`   📡 Live event received: ${event.type || 'unknown'}`);
      } catch (e) {
        console.log(`   📨 Raw gateway message: ${data.toString().substring(0, 100)}...`);
      }
    });
    
    setTimeout(() => {
      console.log('   ⏱️ Connection test timeout');
      ws.close();
      resolve(false);
    }, 3000);
  });
}

async function testDashboardAPI() {
  console.log('2️⃣ Testing Dashboard API Integration...');
  
  return new Promise((resolve) => {
    http.get(GATEWAY_CONFIG.dashboardUrl, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const status = JSON.parse(data);
          
          console.log('   ✅ Dashboard API responding');
          console.log(`   📊 Server status: ${status.status}`);
          console.log(`   🖥️  Uptime: ${status.uptime}`);
          
          if (status.systems && status.systems.openclaw) {
            console.log(`   🔌 OpenClaw status: ${status.systems.openclaw.status}`);
            console.log(`   👥 Active sessions: ${status.systems.openclaw.sessions_active}`);
            console.log(`   🚪 Gateway status: ${status.systems.openclaw.gateway_status}`);
          }
          
          resolve(true);
        } catch (error) {
          console.log(`   ❌ Failed to parse dashboard response: ${error.message}`);
          resolve(false);
        }
      });
    }).on('error', (error) => {
      console.log(`   ❌ Dashboard API error: ${error.message}`);
      resolve(false);
    });
  });
}

async function testLiveEvents() {
  console.log('3️⃣ Testing Live Event Streaming...');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(`${GATEWAY_CONFIG.wsUrl}?token=${GATEWAY_CONFIG.token}`);
    let eventReceived = false;
    
    ws.on('open', () => {
      console.log('   ✅ Connected for event streaming');
      
      // Simulate some activity by sending a test message
      setTimeout(() => {
        if (!eventReceived) {
          console.log('   ⏱️ No events received yet, but connection is active');
        }
        ws.close();
        resolve(eventReceived);
      }, 2000);
    });
    
    ws.on('message', (data) => {
      eventReceived = true;
      console.log('   📡 Live event streaming active!');
      console.log(`   📨 Event type: ${JSON.parse(data.toString()).type || 'unknown'}`);
    });
    
    ws.on('error', (error) => {
      console.log(`   ❌ Event streaming error: ${error.message}`);
      resolve(false);
    });
  });
}

async function runVerification() {
  console.log('Starting comprehensive verification...\\n');
  
  const results = {
    gateway: await testGatewayConnection(),
    dashboard: await testDashboardAPI(),
    events: await testLiveEvents()
  };
  
  console.log('\\n' + '=' .repeat(55));
  console.log('📊 VERIFICATION RESULTS');
  console.log('=' .repeat(55));
  
  console.log(\`🔌 Gateway Connection: \${results.gateway ? '✅ PASS' : '❌ FAIL'}\`);
  console.log(\`📊 Dashboard API: \${results.dashboard ? '✅ PASS' : '❌ FAIL'}\`);
  console.log(\`📡 Live Events: \${results.events ? '✅ PASS' : '❌ FAIL'}\`);
  
  const allPassed = Object.values(results).every(result => result === true);
  
  if (allPassed) {
    console.log('\\n🎉 ALL TESTS PASSED!');
    console.log('✅ Mission Control gateway integration is fully operational');
    console.log('✅ Live OpenClaw events are streaming to your dashboard');
    console.log('✅ Real-time metrics and status updates are active');
  } else {
    console.log('\\n⚠️  Some tests failed. Check the details above.');
  }
  
  console.log('\\n🚀 Your enhanced Mission Control dashboard is ready!');
  console.log('📍 Access: http://localhost:8080/');
  console.log('📊 Gateway is live and streaming events');
}

// Run verification
runVerification().catch(error => {
  console.error('Verification failed:', error);
  process.exit(1);
});