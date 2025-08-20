const express = require('express');
const promClient = require('prom-client');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = process.env.SERVICE_NAME || 'user-service';

// Enable CORS
app.use(cors());
app.use(express.json());

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: SERVICE_NAME
});

// Enable the collection of default metrics
promClient.collectDefaultMetrics({ register });

// Create custom metrics
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

const activeUsers = new promClient.Gauge({
  name: 'active_users',
  help: 'Number of active users',
  registers: [register]
});

const userOperations = new promClient.Counter({
  name: 'user_operations_total',
  help: 'Total user operations',
  labelNames: ['operation'],
  registers: [register]
});

// Simulate user database
const users = new Map();
let activeUserCount = 0;

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: SERVICE_NAME, timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// User endpoints
app.post('/users', (req, res) => {
  try {
    const { name, email } = req.body;
    const id = uuidv4();
    const user = { id, name, email, createdAt: new Date().toISOString() };
    
    users.set(id, user);
    activeUserCount++;
    activeUsers.set(activeUserCount);
    userOperations.inc({ operation: 'create' });
    
    // Simulate occasional failures
    if (Math.random() < 0.1) {
      throw new Error('Random user creation failure');
    }
    
    res.status(201).json(user);
  } catch (error) {
    userOperations.inc({ operation: 'create_failed' });
    res.status(500).json({ error: error.message });
  }
});

app.get('/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const user = users.get(id);
    
    userOperations.inc({ operation: 'read' });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Simulate slow responses occasionally
    const delay = Math.random() < 0.2 ? Math.random() * 2000 : 0;
    setTimeout(() => {
      res.json(user);
    }, delay);
  } catch (error) {
    userOperations.inc({ operation: 'read_failed' });
    res.status(500).json({ error: error.message });
  }
});

app.get('/users', (req, res) => {
  try {
    userOperations.inc({ operation: 'list' });
    const userList = Array.from(users.values());
    res.json(userList);
  } catch (error) {
    userOperations.inc({ operation: 'list_failed' });
    res.status(500).json({ error: error.message });
  }
});

app.delete('/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = users.delete(id);
    
    if (deleted) {
      activeUserCount = Math.max(0, activeUserCount - 1);
      activeUsers.set(activeUserCount);
      userOperations.inc({ operation: 'delete' });
      res.json({ message: 'User deleted' });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    userOperations.inc({ operation: 'delete_failed' });
    res.status(500).json({ error: error.message });
  }
});

// Simulate some initial data
const seedData = () => {
  const sampleUsers = [
    { name: 'John Doe', email: 'john@example.com' },
    { name: 'Jane Smith', email: 'jane@example.com' },
    { name: 'Bob Johnson', email: 'bob@example.com' }
  ];
  
  sampleUsers.forEach(userData => {
    const id = uuidv4();
    const user = { id, ...userData, createdAt: new Date().toISOString() };
    users.set(id, user);
    activeUserCount++;
  });
  
  activeUsers.set(activeUserCount);
};

app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} running on port ${PORT}`);
  seedData();
});