const express = require('express');
const promClient = require('prom-client');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';

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

const orderOperations = new promClient.Counter({
  name: 'order_operations_total',
  help: 'Total order operations',
  labelNames: ['operation', 'status'],
  registers: [register]
});

const orderValue = new promClient.Histogram({
  name: 'order_value_dollars',
  help: 'Order value in dollars',
  buckets: [10, 50, 100, 500, 1000],
  registers: [register]
});

const externalServiceCalls = new promClient.Counter({
  name: 'external_service_calls_total',
  help: 'Total external service calls',
  labelNames: ['service', 'endpoint', 'status'],
  registers: [register]
});

const orders = new Map();

// Middleware to track metrics
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: SERVICE_NAME, timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Helper function to call user service
const validateUser = async (userId) => {
  try {
    const response = await axios.get(`${USER_SERVICE_URL}/users/${userId}`, {
      timeout: 5000
    });
    externalServiceCalls.inc({ service: 'user-service', endpoint: '/users/:id', status: 'success' });
    return response.data;
  } catch (error) {
    externalServiceCalls.inc({ service: 'user-service', endpoint: '/users/:id', status: 'error' });
    throw error;
  }
};

// Order endpoints
app.post('/orders', async (req, res) => {
  try {
    const { userId, items, totalAmount } = req.body;
    
    // Validate user exists
    await validateUser(userId);
    
    const id = uuidv4();
    const order = {
      id,
      userId,
      items: items || [],
      totalAmount: totalAmount || 0,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    // Simulate processing time
    const processingTime = Math.random() * 1000;
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    // Simulate occasional failures
    if (Math.random() < 0.15) {
      orderOperations.inc({ operation: 'create', status: 'failed' });
      throw new Error('Random order processing failure');
    }
    
    orders.set(id, order);
    orderOperations.inc({ operation: 'create', status: 'success' });
    orderValue.observe(totalAmount || 0);
    
    res.status(201).json(order);
  } catch (error) {
    orderOperations.inc({ operation: 'create', status: 'failed' });
    res.status(500).json({ error: error.message });
  }
});

app.get('/orders/:id', (req, res) => {
  try {
    const { id } = req.params;
    const order = orders.get(id);
    
    orderOperations.inc({ operation: 'read', status: order ? 'success' : 'not_found' });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    orderOperations.inc({ operation: 'read', status: 'failed' });
    res.status(500).json({ error: error.message });
  }
});

app.get('/orders', (req, res) => {
  try {
    const { userId } = req.query;
    let orderList = Array.from(orders.values());
    
    if (userId) {
      orderList = orderList.filter(order => order.userId === userId);
    }
    
    orderOperations.inc({ operation: 'list', status: 'success' });
    res.json(orderList);
  } catch (error) {
    orderOperations.inc({ operation: 'list', status: 'failed' });
    res.status(500).json({ error: error.message });
  }
});

app.patch('/orders/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const order = orders.get(id);
    
    if (!order) {
      orderOperations.inc({ operation: 'update', status: 'not_found' });
      return res.status(404).json({ error: 'Order not found' });
    }
    
    order.status = status;
    order.updatedAt = new Date().toISOString();
    orders.set(id, order);
    
    orderOperations.inc({ operation: 'update', status: 'success' });
    res.json(order);
  } catch (error) {
    orderOperations.inc({ operation: 'update', status: 'failed' });
    res.status(500).json({ error: error.message });
  }
});

// Simulate some initial data
const seedData = () => {
  // We'll create some sample orders after a delay to let user service start
  setTimeout(() => {
    const sampleOrders = [
      { userId: 'sample-user-1', items: ['item1', 'item2'], totalAmount: 99.99 },
      { userId: 'sample-user-2', items: ['item3'], totalAmount: 49.99 }
    ];
    
    sampleOrders.forEach(orderData => {
      const id = uuidv4();
      const order = {
        id,
        ...orderData,
        status: 'completed',
        createdAt: new Date().toISOString()
      };
      orders.set(id, order);
    });
  }, 2000);
};

app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} running on port ${PORT}`);
  seedData();
});