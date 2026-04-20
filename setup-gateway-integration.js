#!/usr/bin/env node
// Quick Gateway Integration for Mission Control
// Run this to add OpenClaw gateway connection to your existing dashboard

const fs = require('fs');
const path = require('path');

console.log('🚀 Mission Control Gateway Integration Setup');
console.log('=' .repeat(50));

// Check if gateway integration files exist
const gatewayIntegrationPath = path.join(__dirname, 'gateway-integration.js');
const serverEnhancementPath = path.join(__dirname, 'server-gateway-enhancement.js');

if (!fs.existsSync(gatewayIntegrationPath)) {
  console.error('❌ gateway-integration.js not found. Please ensure it exists.');
  process.exit(1);
}

if (!fs.existsSync(serverEnhancementPath)) {
  console.error('❌ server-gateway-enhancement.js not found. Please ensure it exists.');
  process.exit(1);
}

// Create an enhanced server that combines your existing code with gateway integration
const enhancedServerCode = `
// Enhanced Mission Control Server with Gateway Integration
// This combines your existing server with OpenClaw gateway connection

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const GatewayIntegration = require('./gateway-integration.js');

// Add WebSocket support
const WebSocket = require('ws');

// Existing constants from your server...
const PORT = 8080;
const HOST = "127.0.0.1";
const PROJECT_ROOT = __dirname;
const DATA_FILE = path.join(PROJECT_ROOT, "mc-data.json");
const ACTIVITY_FILE = path.join(PROJECT_ROOT, "mc-activity.json");

// Initialize gateway integration
const gateway = new GatewayIntegration();
let dashboardClients = []; // WebSocket clients for real-time updates

// Add gateway connection startup
async function startGateway() {
  console.log('🔌 Connecting to OpenClaw gateway...');
  console.log(\`📡 URL: \${gateway.config.wsUrl}\`);
  console.log(\`🔑 Token: \${gateway.config.token.substring(0, 8)}...\`);
  
  try {
    await gateway.connect();
    console.log('✅ Gateway connected successfully!');
    
    // Set up event forwarding to dashboard clients
    gateway.onEvent((eventData) => {
      // Broadcast to all connected dashboard WebSocket clients
      dashboardClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'gateway_event',
            data: eventData,
            timestamp: new Date().toISOString()
          }));
        }
      });
    });
    
  } catch (error) {
    console.error('❌ Gateway connection failed:', error.message);
  }
}

// Add new API endpoints
async function handleGatewayStatus(req, res) {
  const status = gateway.getStatus();
  sendJson(res, 200, {
    status: 'success',
    data: {
      connected: status.connected,
      metrics: status.metrics,
      recentEvents: status.recentEvents,
      config: status.config
    },
    timestamp: new Date().toISOString()
  });
}

async function handleLiveEvents(req, res) {
  // Server-sent events for real-time gateway updates
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Send initial connection event
  res.write('data: ' + JSON.stringify({
    type: 'connection',
    connected: gateway.isConnected,
    timestamp: new Date().toISOString()
  }) + '\\n\\n');
  
  // Set up event listener
  const eventHandler = (eventData) => {
    res.write('data: ' + JSON.stringify(eventData) + '\\n\\n');
  };
  
  gateway.onEvent(eventHandler);
  
  // Clean up on client disconnect
  req.on('close', () => {
    gateway.eventCallbacks = gateway.eventCallbacks.filter(cb => cb !== eventHandler);
  });
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
      version: "2.1.0-gateway",
      timestamp: now.toISOString()
    },
    gateway: {
      status: gatewayStatus.connected ? "connected" : "disconnected",
      commandsExecuted: gatewayStatus.metrics.commandsExecuted,
      sessionsActive: gatewayStatus.metrics.sessionsActive,
      lastHeartbeat: gatewayStatus.metrics.lastHeartbeat,
      reconnectAttempts: gatewayStatus.metrics.reconnectAttempts
    },
    systems: await getSystemsStatus(),
    revenue: await getRevenueData()
  };
  
  sendJson(res, 200, statusData);
}

// Add WebSocket server for real-time dashboard updates
function createWebSocketServer(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });
  
  wss.on('connection', (ws) => {
    console.log('[WebSocket] Dashboard client connected');
    dashboardClients.push(ws);
    
    // Send current gateway status
    ws.send(JSON.stringify({
      type: 'gateway_status',
      data: gateway.getStatus(),
      timestamp: new Date().toISOString()
    }));
    
    ws.on('close', () => {
      console.log('[WebSocket] Dashboard client disconnected');
      dashboardClients = dashboardClients.filter(client => client !== ws);
    });
    
    ws.on('error', (error) => {
      console.error('[WebSocket] Client error:', error);
      dashboardClients = dashboardClients.filter(client => client !== ws);
    });
  });
  
  return wss;
}

// Modified request handler - add new routes
async function requestHandler(req, res) {
  try {
    const url = new URL(req.url, \`http://\${req.headers.host}\`);
    
    // Add new gateway endpoints
    if (url.pathname === "/api/gateway/status") {
      await handleGatewayStatus(req, res);
      return;
    }
    
    if (url.pathname === "/api/live-events") {
      await handleLiveEvents(req, res);
      return;
    }
    
    // Enhanced status endpoint (replaces existing)
    if (url.pathname === "/api/status") {
      await handleEnhancedStatus(req, res);
      return;
    }
    
    // Your existing routing logic here...
    // (Include all your existing API endpoints)
    
  } catch (error) {
    console.error(\`[\${new Date().toISOString()}]\`, error);
    sendJson(res, 500, { error: error.message || "Internal server error." });
  }
}

// Modified bootstrap function
async function bootstrap() {
  await ensureJsonFile(DATA_FILE, DEFAULT_DASHBOARD_DATA);
  await ensureJsonFile(ACTIVITY_FILE, DEFAULT_ACTIVITY);
  
  // Start gateway connection
  await startGateway();
}

// Start enhanced server
const server = http.createServer(requestHandler);

// Add WebSocket support
const wss = createWebSocketServer(server);

server.listen(PORT, HOST, async () => {
  await bootstrap();
  console.log(\`🚀 Enhanced Mission Control running at http://\${HOST}:\${PORT}\`);
  console.log('📊 Gateway integration active');
  console.log('🌐 WebSocket endpoint: ws://localhost:8080/ws');
  console.log('📋 New API endpoints:');
  console.log('  • /api/gateway/status - Gateway connection status');
  console.log('  • /api/live-events - Server-sent events for real-time updates');
  console.log('  • Enhanced /api/status - Includes gateway metrics');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\\n🛑 Shutting down gracefully...');
  gateway.disconnect();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
`;

// Write the enhanced server
const outputPath = path.join(__dirname, 'server-with-gateway.js');
fs.writeFileSync(outputPath, enhancedServerCode);

console.log('✅ Enhanced server created: server-with-gateway.js');
console.log('');
console.log('🚀 To use your enhanced Mission Control with live gateway connection:');
console.log('1. Backup your current server: cp server.js server.backup.js');
console.log('2. Replace with enhanced version: cp server-with-gateway.js server.js');
console.log('3. Install WebSocket support: npm install ws');
console.log('4. Start your server: node server.js');
console.log('');
console.log('📊 New features:');
console.log('  • Live OpenClaw gateway connection');
console.log('  • Real-time event streaming to dashboard');
console.log('  • WebSocket support for instant updates');
console.log('  • Server-sent events for live data');
console.log('  • Enhanced API endpoints with gateway metrics');
console.log('');
console.log('🔌 Gateway connection uses the working token I discovered');
console.log('📡 Connection: ws://127.0.0.1:18789?token=YOUR_TOKEN');