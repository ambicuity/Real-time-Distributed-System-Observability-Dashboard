const express = require('express');
const promClient = require('prom-client');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = process.env.SERVICE_NAME || 'api-gateway';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3002';
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3003';

app.use(cors());
app.use(express.json());

// Create a Registry to register the metrics
const register = new promClient.Registry();
register.setDefaultLabels({ app: SERVICE_NAME });
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
});

const gatewayOperations = new promClient.Counter({
  name: 'gateway_operations_total',
  help: 'Total gateway operations',
  labelNames: ['operation', 'target_service', 'status'],
  registers: [register]
});

const serviceResponseTime = new promClient.Histogram({
  name: 'service_response_time_seconds',
  help: 'Response time from downstream services',
  labelNames: ['service', 'endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register]
});

let connectionCount = 0;

// Middleware to track metrics
app.use((req, res, next) => {
  const start = Date.now();
  connectionCount++;
  activeConnections.set(connectionCount);
  
  res.on('finish', () => {
    connectionCount = Math.max(0, connectionCount - 1);
    activeConnections.set(connectionCount);
    
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode
    });
    httpRequestDuration.observe({
      method: req.method,
      route: req.route?.path || req.path
    }, duration);
  });
  
  next();
});

// Helper function to make service calls with metrics
const makeServiceCall = async (serviceName, url, config = {}) => {
  const start = Date.now();
  try {
    const response = await axios({
      ...config,
      url,
      timeout: 10000
    });
    
    const duration = (Date.now() - start) / 1000;
    serviceResponseTime.observe(
      { service: serviceName, endpoint: config.url || url },
      duration
    );
    gatewayOperations.inc({ operation: 'proxy', target_service: serviceName, status: 'success' });
    
    return response;
  } catch (error) {
    const duration = (Date.now() - start) / 1000;
    serviceResponseTime.observe(
      { service: serviceName, endpoint: config.url || url },
      duration
    );
    gatewayOperations.inc({ operation: 'proxy', target_service: serviceName, status: 'error' });
    
    throw error;
  }
};

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    dependencies: {}
  };
  
  // Check downstream services
  const services = [
    { name: 'user-service', url: `${USER_SERVICE_URL}/health` },
    { name: 'order-service', url: `${ORDER_SERVICE_URL}/health` },
    { name: 'inventory-service', url: `${INVENTORY_SERVICE_URL}/health` }
  ];
  
  for (const service of services) {
    try {
      const response = await axios.get(service.url, { timeout: 3000 });
      health.dependencies[service.name] = { status: 'healthy', responseTime: response.headers['x-response-time'] };
    } catch (error) {
      health.dependencies[service.name] = { status: 'unhealthy', error: error.message };
      health.status = 'degraded';
    }
  }
  
  res.json(health);
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// API Routes

// User service routes
app.all('/api/users*', async (req, res) => {
  try {
    const path = req.url.replace('/api/users', '/users');
    const response = await makeServiceCall('user-service', `${USER_SERVICE_URL}${path}`, {
      method: req.method,
      data: req.body,
      headers: { 'Content-Type': 'application/json' }
    });
    
    res.status(response.status).json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    res.status(status).json({ error: message, service: 'user-service' });
  }
});

// Order service routes
app.all('/api/orders*', async (req, res) => {
  try {
    const path = req.url.replace('/api/orders', '/orders');
    const response = await makeServiceCall('order-service', `${ORDER_SERVICE_URL}${path}`, {
      method: req.method,
      data: req.body,
      headers: { 'Content-Type': 'application/json' }
    });
    
    res.status(response.status).json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    res.status(status).json({ error: message, service: 'order-service' });
  }
});

// Inventory service routes
app.all('/api/inventory*', async (req, res) => {
  try {
    const path = req.url.replace('/api/inventory', '/inventory');
    const response = await makeServiceCall('inventory-service', `${INVENTORY_SERVICE_URL}${path}`, {
      method: req.method,
      data: req.body,
      headers: { 'Content-Type': 'application/json' }
    });
    
    res.status(response.status).json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    res.status(status).json({ error: message, service: 'inventory-service' });
  }
});

// Complex business operations that involve multiple services
app.post('/api/orders-with-validation', async (req, res) => {
  try {
    const { userId, items, totalAmount } = req.body;
    
    // 1. Validate user exists
    await makeServiceCall('user-service', `${USER_SERVICE_URL}/users/${userId}`, {
      method: 'GET'
    });
    
    // 2. Check inventory availability for all items
    for (const item of items || []) {
      await makeServiceCall('inventory-service', 
        `${INVENTORY_SERVICE_URL}/inventory/${item.id}/availability?requestedQuantity=${item.quantity}`, {
        method: 'GET'
      });
    }
    
    // 3. Create the order
    const orderResponse = await makeServiceCall('order-service', `${ORDER_SERVICE_URL}/orders`, {
      method: 'POST',
      data: { userId, items, totalAmount }
    });
    
    // 4. Update inventory for each item
    for (const item of items || []) {
      await makeServiceCall('inventory-service', 
        `${INVENTORY_SERVICE_URL}/inventory/${item.id}/stock`, {
        method: 'PATCH',
        data: { operation: 'remove', quantity: item.quantity }
      });
    }
    
    gatewayOperations.inc({ operation: 'complex_order', target_service: 'multiple', status: 'success' });
    res.status(201).json({
      ...orderResponse.data,
      message: 'Order created and inventory updated successfully'
    });
    
  } catch (error) {
    gatewayOperations.inc({ operation: 'complex_order', target_service: 'multiple', status: 'error' });
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    res.status(status).json({ 
      error: `Order validation failed: ${message}`,
      step: 'order-with-validation'
    });
  }
});

// Dashboard summary endpoint
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const summary = {
      timestamp: new Date().toISOString(),
      services: {},
      totalUsers: 0,
      totalOrders: 0,
      totalInventoryItems: 0,
      lowStockItems: 0
    };
    
    // Get users count
    try {
      const usersResponse = await makeServiceCall('user-service', `${USER_SERVICE_URL}/users`, { method: 'GET' });
      summary.totalUsers = usersResponse.data.length;
      summary.services.userService = 'healthy';
    } catch (error) {
      summary.services.userService = 'unhealthy';
    }
    
    // Get orders count
    try {
      const ordersResponse = await makeServiceCall('order-service', `${ORDER_SERVICE_URL}/orders`, { method: 'GET' });
      summary.totalOrders = ordersResponse.data.length;
      summary.services.orderService = 'healthy';
    } catch (error) {
      summary.services.orderService = 'unhealthy';
    }
    
    // Get inventory summary
    try {
      const inventoryResponse = await makeServiceCall('inventory-service', `${INVENTORY_SERVICE_URL}/inventory`, { method: 'GET' });
      summary.totalInventoryItems = inventoryResponse.data.length;
      summary.services.inventoryService = 'healthy';
      
      // Check low stock
      const lowStockResponse = await makeServiceCall('inventory-service', `${INVENTORY_SERVICE_URL}/inventory?lowStock=true`, { method: 'GET' });
      summary.lowStockItems = lowStockResponse.data.length;
    } catch (error) {
      summary.services.inventoryService = 'unhealthy';
    }
    
    gatewayOperations.inc({ operation: 'dashboard_summary', target_service: 'multiple', status: 'success' });
    res.json(summary);
    
  } catch (error) {
    gatewayOperations.inc({ operation: 'dashboard_summary', target_service: 'multiple', status: 'error' });
    res.status(500).json({ error: 'Failed to generate dashboard summary' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Gateway error:', error);
  gatewayOperations.inc({ operation: 'error', target_service: 'gateway', status: 'error' });
  res.status(500).json({ error: 'Internal gateway error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} running on port ${PORT}`);
});