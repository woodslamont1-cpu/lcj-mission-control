// Gateway Integration Module for Mission Control
// Adds live OpenClaw gateway connection to your existing dashboard

const WebSocket = require('ws');

class GatewayIntegration {
  constructor() {
    this.config = {
      wsUrl: 'ws://127.0.0.1:18789',
      token: '03647d103f0aab173b344bc01fb682f348f689a668ba4086',
      reconnectInterval: 5000,
      maxReconnectAttempts: 10
    };
    
    this.ws = null;
    this.isConnected = false;
    this.eventBuffer = [];
    this.metrics = {
      commandsExecuted: 0,
      sessionsActive: 0,
      lastHeartbeat: null,
      connectionStart: null,
      reconnectAttempts: 0
    };
    
    this.eventCallbacks = [];
  }
  
  // Connect to OpenClaw gateway
  connect() {
    if (this.isConnected) return Promise.resolve();
    
    return new Promise((resolve, reject) => {
      console.log('[Gateway] Connecting to OpenClaw gateway...');
      
      try {
        const wsUrl = `${this.config.wsUrl}?token=${this.config.token}`;
        this.ws = new WebSocket(wsUrl);
        
        this.ws.on('open', () => {
          this.isConnected = true;
          this.metrics.connectionStart = Date.now();
          this.metrics.reconnectAttempts = 0;
          console.log('[Gateway] Connected successfully!');
          
          this.broadcastEvent({
            type: 'connection',
            event: 'connected',
            message: 'Mission Control connected to OpenClaw gateway',
            timestamp: new Date().toISOString()
          });
          
          resolve();
        });
        
        this.ws.on('message', (data) => {
          try {
            const eventData = JSON.parse(data.toString());
            this.processEvent(eventData);
          } catch (error) {
            console.log('[Gateway] Raw message:', data.toString());
          }
        });
        
        this.ws.on('close', () => {
          this.handleDisconnection();
        });
        
        this.ws.on('error', (error) => {
          console.error('[Gateway] Connection error:', error.message);
          this.handleDisconnection();
          reject(error);
        });
        
      } catch (error) {
        console.error('[Gateway] Failed to create connection:', error);
        reject(error);
      }
    });
  }
  
  // Process incoming gateway events
  processEvent(eventData) {
    // Update metrics
    if (eventData.type === 'tool_call') {
      this.metrics.commandsExecuted++;
    } else if (eventData.type === 'session_update') {
      this.metrics.sessionsActive = eventData.sessions || 0;
    } else if (eventData.type === 'heartbeat') {
      this.metrics.lastHeartbeat = new Date().toISOString();
    }
    
    // Add to buffer
    this.eventBuffer.unshift({
      ...eventData,
      receivedAt: new Date().toISOString()
    });
    
    if (this.eventBuffer.length > 50) {
      this.eventBuffer.pop();
    }
    
    // Broadcast to callbacks
    this.broadcastEvent(eventData);
  }
  
  // Handle disconnection
  handleDisconnection() {
    this.isConnected = false;
    console.log('[Gateway] Disconnected');
    
    this.broadcastEvent({
      type: 'connection',
      event: 'disconnected',
      message: 'Disconnected from OpenClaw gateway',
      timestamp: new Date().toISOString()
    });
    
    // Schedule reconnection
    this.scheduleReconnection();
  }
  
  // Schedule reconnection
  scheduleReconnection() {
    if (this.metrics.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.metrics.reconnectAttempts++;
      console.log(`[Gateway] Reconnecting in ${this.config.reconnectInterval}ms (attempt ${this.metrics.reconnectAttempts})`);
      
      setTimeout(() => {
        if (!this.isConnected) {
          this.connect().catch(err => console.error('[Gateway] Reconnection failed:', err));
        }
      }, this.config.reconnectInterval);
    }
  }
  
  // Broadcast events to registered callbacks
  broadcastEvent(eventData) {
    this.eventCallbacks.forEach(callback => {
      try {
        callback(eventData);
      } catch (error) {
        console.error('[Gateway] Callback error:', error);
      }
    });
  }
  
  // Register event callback
  onEvent(callback) {
    this.eventCallbacks.push(callback);
  }
  
  // Get current status
  getStatus() {
    const uptime = this.metrics.connectionStart ? Date.now() - this.metrics.connectionStart : 0;
    
    return {
      connected: this.isConnected,
      uptime: uptime,
      metrics: this.metrics,
      recentEvents: this.eventBuffer.slice(0, 10),
      config: {
        wsUrl: this.config.wsUrl,
        lastConnectionAttempt: this.metrics.lastHeartbeat
      }
    };
  }
  
  // Disconnect gracefully
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

// Export for use in your server
module.exports = GatewayIntegration;