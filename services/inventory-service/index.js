const express = require('express');
const promClient = require('prom-client');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = process.env.SERVICE_NAME || 'inventory-service';

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

const inventoryOperations = new promClient.Counter({
  name: 'inventory_operations_total',
  help: 'Total inventory operations',
  labelNames: ['operation', 'status'],
  registers: [register]
});

const stockLevels = new promClient.Gauge({
  name: 'inventory_stock_level',
  help: 'Current stock levels',
  labelNames: ['item_id', 'item_name'],
  registers: [register]
});

const stockMovements = new promClient.Counter({
  name: 'inventory_stock_movements_total',
  help: 'Total stock movements',
  labelNames: ['item_id', 'movement_type'],
  registers: [register]
});

const inventory = new Map();

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

// Inventory endpoints
app.post('/inventory', (req, res) => {
  try {
    const { name, quantity, price } = req.body;
    const id = uuidv4();
    const item = {
      id,
      name,
      quantity: quantity || 0,
      price: price || 0,
      createdAt: new Date().toISOString()
    };
    
    inventory.set(id, item);
    stockLevels.set({ item_id: id, item_name: name }, quantity || 0);
    inventoryOperations.inc({ operation: 'create', status: 'success' });
    stockMovements.inc({ item_id: id, movement_type: 'initial' });
    
    res.status(201).json(item);
  } catch (error) {
    inventoryOperations.inc({ operation: 'create', status: 'failed' });
    res.status(500).json({ error: error.message });
  }
});

app.get('/inventory', (req, res) => {
  try {
    const { lowStock } = req.query;
    let items = Array.from(inventory.values());
    
    if (lowStock === 'true') {
      items = items.filter(item => item.quantity < 10);
    }
    
    inventoryOperations.inc({ operation: 'list', status: 'success' });
    res.json(items);
  } catch (error) {
    inventoryOperations.inc({ operation: 'list', status: 'failed' });
    res.status(500).json({ error: error.message });
  }
});

app.get('/inventory/:id', (req, res) => {
  try {
    const { id } = req.params;
    const item = inventory.get(id);
    
    inventoryOperations.inc({ operation: 'read', status: item ? 'success' : 'not_found' });
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(item);
  } catch (error) {
    inventoryOperations.inc({ operation: 'read', status: 'failed' });
    res.status(500).json({ error: error.message });
  }
});

app.patch('/inventory/:id/stock', (req, res) => {
  try {
    const { id } = req.params;
    const { operation, quantity } = req.body; // operation: 'add' or 'remove'
    const item = inventory.get(id);
    
    if (!item) {
      inventoryOperations.inc({ operation: 'update_stock', status: 'not_found' });
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const quantityChange = parseInt(quantity) || 0;
    
    if (operation === 'add') {
      item.quantity += quantityChange;
      stockMovements.inc({ item_id: id, movement_type: 'restock' });
    } else if (operation === 'remove') {
      if (item.quantity < quantityChange) {
        inventoryOperations.inc({ operation: 'update_stock', status: 'insufficient_stock' });
        return res.status(400).json({ error: 'Insufficient stock' });
      }
      item.quantity -= quantityChange;
      stockMovements.inc({ item_id: id, movement_type: 'sale' });
    }
    
    // Simulate occasional stock management failures
    if (Math.random() < 0.05) {
      inventoryOperations.inc({ operation: 'update_stock', status: 'failed' });
      throw new Error('Stock management system temporarily unavailable');
    }
    
    item.updatedAt = new Date().toISOString();
    inventory.set(id, item);
    stockLevels.set({ item_id: id, item_name: item.name }, item.quantity);
    
    inventoryOperations.inc({ operation: 'update_stock', status: 'success' });
    res.json(item);
  } catch (error) {
    inventoryOperations.inc({ operation: 'update_stock', status: 'failed' });
    res.status(500).json({ error: error.message });
  }
});

app.get('/inventory/:id/availability', (req, res) => {
  try {
    const { id } = req.params;
    const { requestedQuantity } = req.query;
    const item = inventory.get(id);
    
    inventoryOperations.inc({ operation: 'check_availability', status: item ? 'success' : 'not_found' });
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const requested = parseInt(requestedQuantity) || 1;
    const available = item.quantity >= requested;
    
    res.json({
      itemId: id,
      requestedQuantity: requested,
      availableQuantity: item.quantity,
      available,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    inventoryOperations.inc({ operation: 'check_availability', status: 'failed' });
    res.status(500).json({ error: error.message });
  }
});

// Simulate stock level changes periodically
const simulateStockChanges = () => {
  setInterval(() => {
    const items = Array.from(inventory.values());
    if (items.length > 0) {
      const randomItem = items[Math.floor(Math.random() * items.length)];
      
      // Random stock movement
      if (Math.random() < 0.3) {
        const change = Math.floor(Math.random() * 5) + 1;
        if (Math.random() < 0.7) {
          // Remove stock (sale)
          if (randomItem.quantity > 0) {
            randomItem.quantity = Math.max(0, randomItem.quantity - change);
            stockMovements.inc({ item_id: randomItem.id, movement_type: 'sale' });
          }
        } else {
          // Add stock (restock)
          randomItem.quantity += change;
          stockMovements.inc({ item_id: randomItem.id, movement_type: 'restock' });
        }
        
        inventory.set(randomItem.id, randomItem);
        stockLevels.set({ item_id: randomItem.id, item_name: randomItem.name }, randomItem.quantity);
      }
    }
  }, 5000); // Every 5 seconds
};

// Seed data
const seedData = () => {
  const sampleItems = [
    { name: 'Laptop', quantity: 25, price: 999.99 },
    { name: 'Mouse', quantity: 150, price: 29.99 },
    { name: 'Keyboard', quantity: 75, price: 79.99 },
    { name: 'Monitor', quantity: 30, price: 299.99 },
    { name: 'Headphones', quantity: 45, price: 149.99 }
  ];
  
  sampleItems.forEach(itemData => {
    const id = uuidv4();
    const item = {
      id,
      ...itemData,
      createdAt: new Date().toISOString()
    };
    inventory.set(id, item);
    stockLevels.set({ item_id: id, item_name: item.name }, item.quantity);
  });
};

app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} running on port ${PORT}`);
  seedData();
  simulateStockChanges();
});