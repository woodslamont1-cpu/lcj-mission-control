// Enhanced server.js with OpenClaw Gateway Integration
// This adds live gateway connection to your existing Mission Control

const http = require("http");
const path = require("path");
const GatewayIntegration = require('./gateway-integration.js');

// Initialize gateway integration
const gateway = new GatewayIntegration();

// Add gateway connection to your existing server startup
async function initializeGateway() {
  console.log('🚀 Initializing OpenClaw Gateway Connection...');
  console.log(`📡 Gateway: ${gateway.config.wsUrl}`);
  console.log(`🔑 Auth: Token-based`);
  
  try {
    await gateway.connect();
    console.log('✅ Gateway connection established!');
    
    // Set up event handling
    gateway.onEvent((eventData) => {
      console.log('[Live Event]', eventData.type, eventData.message || '');
      
      // You can add logic here to update your dashboard in real-time
      // For example, emit to WebSocket clients, update data files, etc.
    });
    
  } catch (error) {
    console.error('❌ Gateway connection failed:', error.message);
  }
}

// Add new API endpoints to your existing server
async function handleGatewayStatus(req, res) {
  const status = gateway.getStatus();
  
  res.writeHead(200, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify({
    status: 'success',
    data: status,
    timestamp: new Date().toISOString()
  }, null, 2));
}

async function handleGatewayEvents(req, res) {
  const events = {
    recent: gateway.getStatus().recentEvents,
    metrics: gateway.getStatus().metrics,
    connected: gateway.isConnected
  };
  
  res.writeHead(200, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify({
    status: 'success',
    data: events,
    timestamp: new Date().toISOString()
  }, null, 2));
}

// Enhanced existing status endpoint
async function handleEnhancedStatus(req, res) {
  const now = new Date();
  const uptimeSeconds = Math.floor((now - serverStartedAt) / 1000);
  const gatewayStatus = gateway.getStatus();
  
  const statusData = {
    server: {
      status: "online",
      uptime: formatUptime(uptimeSeconds),
      version: "2.1.0",
      timestamp: now.toISOString()
    },
    gateway: {
      status: gatewayStatus.connected ? "connected" : "disconnected",
      commandsExecuted: gatewayStatus.metrics.commandsExecuted,
      sessionsActive: gatewayStatus.metrics.sessionsActive,
      lastHeartbeat: gatewayStatus.metrics.lastHeartbeat,
      reconnectAttempts: gatewayStatus.metrics.reconnectAttempts,
      uptime: gatewayStatus.uptime
    },
    dashboard: {
      title: "LCJ Elite Mission Control",
      branding: "Mr. Automation",
      features: ["Live Gateway Events", "Real-time Metrics", "Professional UI", "Cost Optimization", "WebSocket Integration"]
    }
  };
  
  res.writeHead(200, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(statusData, null, 2));
}

// Add these routes to your existing request handler
// In your main requestHandler function, add:
/*
// Gateway Integration Endpoints
if (url.pathname === "/api/gateway/status") {
  await handleGatewayStatus(req, res);
  return;
}

if (url.pathname === "/api/gateway/events") {
  await handleGatewayEvents(req, res);
  return;
}

// Enhanced existing status endpoint
if (url.pathname === "/api/status") {
  await handleEnhancedStatus(req, res);
  return;
}
*/

// Initialize gateway when server starts
console.log('🚀 Enhanced Mission Control with Gateway Integration');
console.log('=' .repeat(60));

// Start gateway connection
initializeGateway();

console.log('✅ Enhanced server ready!');
console.log('📊 New API endpoints available:');
console.log('  • /api/gateway/status - Gateway connection status');
console.log('  • /api/gateway/events - Live gateway events');
console.log('  • Enhanced /api/status - Includes gateway metrics');

// Export for use in your main server file
module.exports = {
  gateway,
  handleGatewayStatus,
  handleGatewayEvents,
  handleEnhancedStatus,
  initializeGateway
};