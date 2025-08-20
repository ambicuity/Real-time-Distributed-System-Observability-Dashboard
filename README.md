# Real-time Distributed System Observability Dashboard

A comprehensive observability dashboard for monitoring distributed systems using Prometheus and Grafana. This project demonstrates real-time insights into system health, performance metrics, and failure detection across microservices.

## 🏗️ Architecture Overview

The system consists of:

### Microservices
- **API Gateway** (Port 3000) - Routes requests and aggregates responses
- **User Service** (Port 3001) - Manages user data and operations
- **Order Service** (Port 3002) - Handles order processing and validation
- **Inventory Service** (Port 3003) - Manages stock levels and availability

### Monitoring Stack
- **Prometheus** (Port 9090) - Metrics collection and alerting
- **Grafana** (Port 3004) - Visualization and dashboards
- **Node Exporter** (Port 9100) - System-level metrics

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- curl (for load testing)

### Launch the System
```bash
# Clone the repository
git clone https://github.com/ambicuity/Real-time-Distributed-System-Observability-Dashboard.git
cd Real-time-Distributed-System-Observability-Dashboard

# Start all services
docker compose up -d

# Wait for services to be ready (about 30 seconds)
docker compose logs -f
```

### Access the Dashboard
- **Grafana Dashboard**: http://localhost:3004 (admin/admin)
- **Prometheus**: http://localhost:9090
- **API Gateway**: http://localhost:3000
- **System Health**: http://localhost:3000/health

## 📊 Key Observability Features

### Real-time Metrics
- **Request Rate**: HTTP requests per second across all services
- **Response Time**: Latency percentiles (50th, 95th, 99th)
- **Error Rate**: 4xx/5xx error tracking by service
- **Service Availability**: Uptime monitoring with SLA tracking

### Business Metrics
- **Active Users**: Real-time user count
- **Order Processing**: Orders per minute and success rates
- **Inventory Levels**: Stock tracking with low-stock alerts
- **Service Dependencies**: Inter-service call monitoring

### Alerting Rules
- Service downtime detection (>30s)
- High error rates (>10% for 2 minutes)
- Response time SLA breaches (>1s 95th percentile)
- Low inventory alerts (<10 units)
- Resource utilization alerts (CPU >80%, Memory >80%)

## 🧪 Load Testing & Simulation

Generate realistic load to observe the monitoring in action:

```bash
# Run load test for 60 seconds (default)
./scripts/load_test.sh

# Run for custom duration
./scripts/load_test.sh 300  # 5 minutes
```

The load test simulates:
- User registration
- Order creation with validation
- Inventory queries
- Complex multi-service transactions

## 🔍 Failure Simulation

The services include built-in failure simulation:
- **Random failures**: 10-15% failure rate on critical operations
- **Slow responses**: Occasional 2-second delays
- **Stock management errors**: Inventory update failures
- **Service dependency failures**: Timeout scenarios

## 📈 Dashboard Features

### System Overview Dashboard
- **Service Availability Gauge**: Overall system health
- **Request Volume**: Traffic patterns across services
- **Response Time Distribution**: Performance characteristics
- **Error Rate Trends**: Failure pattern analysis
- **Business KPIs**: Users, orders, inventory status

### Alert Integration
- Visual alert indicators on dashboards
- Prometheus alerting rules for proactive monitoring
- Color-coded status indicators (green/yellow/red)

## 🛠️ Technical Implementation

### Metrics Collection
Each service exposes `/metrics` endpoint with:
- **Standard HTTP metrics**: Request count, duration, status codes
- **Custom business metrics**: User count, order volume, stock levels
- **Application performance**: Memory usage, garbage collection
- **Error tracking**: Failed operations by type

### Service Discovery
Prometheus automatically discovers and monitors:
- All microservices via Docker network
- Node exporter for system metrics
- Custom service health endpoints

### Data Retention
- **Prometheus**: 200h retention for historical analysis
- **Grafana**: Persistent dashboards and configurations
- **Alerting**: Configurable alert evaluation intervals

## 🔧 Configuration

### Prometheus Configuration
- **Scrape intervals**: 5s for real-time monitoring
- **Alert evaluation**: 15s intervals
- **Service discovery**: Static configuration for demo

### Grafana Setup
- **Auto-provisioned dashboards**: No manual configuration needed
- **Prometheus datasource**: Pre-configured connection
- **Admin credentials**: admin/admin (change in production)

## 📋 API Endpoints

### Health Checks
- `GET /health` - Service health status
- `GET /metrics` - Prometheus metrics

### Business Operations
- `POST /api/users` - Create user
- `GET /api/users` - List users
- `POST /api/orders` - Create order
- `GET /api/orders` - List orders
- `GET /api/inventory` - List inventory
- `PATCH /api/inventory/:id/stock` - Update stock

### Complex Operations
- `POST /api/orders-with-validation` - Multi-service order processing
- `GET /api/dashboard/summary` - Business metrics summary

## 🏆 Key Observability Concepts Demonstrated

### 1. **Golden Signals**
- **Latency**: Response time monitoring
- **Traffic**: Request rate tracking
- **Errors**: Error rate and type classification
- **Saturation**: Resource utilization monitoring

### 2. **Service Level Indicators (SLIs)**
- Availability percentage
- Response time percentiles
- Error ratios
- Throughput metrics

### 3. **Alerting Strategy**
- **Symptom-based alerts**: User-impacting issues
- **Cause-based alerts**: Infrastructure problems
- **Escalation paths**: Warning → Critical progression

### 4. **Distributed Tracing Concepts**
- Service dependency mapping
- Request flow visualization
- Error propagation tracking

## 🚨 Common Issues & Troubleshooting

### Services Not Starting
```bash
# Check service status
docker compose ps

# View service logs
docker compose logs [service-name]

# Restart specific service
docker compose restart [service-name]
```

### Metrics Not Appearing
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Verify service metrics
curl http://localhost:3000/metrics
```

### Dashboard Not Loading
```bash
# Reset Grafana
docker compose restart grafana

# Check Grafana logs
docker compose logs grafana
```

## 🔮 Future Enhancements

- **Distributed Tracing**: Add Jaeger for request tracing
- **Log Aggregation**: ELK stack integration
- **Custom Metrics**: Domain-specific KPIs
- **Auto-scaling**: Kubernetes deployment with HPA
- **Security Monitoring**: Authentication and authorization metrics

## 📝 License

MIT License - Feel free to use this project for learning and demonstration purposes.

---

This project demonstrates production-ready observability practices for distributed systems, providing the foundation for turning complex system chaos into clear, actionable insights.