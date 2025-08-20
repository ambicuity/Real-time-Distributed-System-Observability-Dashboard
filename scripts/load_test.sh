#!/bin/bash

# Load testing script to simulate distributed system load
echo "Starting load simulation for distributed system observability..."

API_GATEWAY_URL="http://localhost:3000"
USERS_ENDPOINT="$API_GATEWAY_URL/api/users"
ORDERS_ENDPOINT="$API_GATEWAY_URL/api/orders"
INVENTORY_ENDPOINT="$API_GATEWAY_URL/api/inventory"

# Function to create random user
create_user() {
    local name="User$(shuf -i 1-1000 -n 1)"
    local email="user$(shuf -i 1-1000 -n 1)@example.com"
    
    curl -s -X POST "$USERS_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"$name\",\"email\":\"$email\"}" > /dev/null
}

# Function to create random order
create_order() {
    local userId="sample-user-$(shuf -i 1-3 -n 1)"
    local amount=$(shuf -i 20-500 -n 1).99
    
    curl -s -X POST "$ORDERS_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{\"userId\":\"$userId\",\"items\":[{\"id\":\"item1\",\"quantity\":1}],\"totalAmount\":$amount}" > /dev/null
}

# Function to check inventory
check_inventory() {
    curl -s "$INVENTORY_ENDPOINT" > /dev/null
}

# Function to simulate load
simulate_load() {
    echo "Simulating load for $1 seconds..."
    local end_time=$((SECONDS + $1))
    
    while [ $SECONDS -lt $end_time ]; do
        # Random action
        local action=$(shuf -i 1-4 -n 1)
        
        case $action in
            1) create_user ;;
            2) create_order ;;
            3) check_inventory ;;
            4) curl -s "$API_GATEWAY_URL/api/dashboard/summary" > /dev/null ;;
        esac
        
        # Random delay between requests
        sleep $(awk 'BEGIN{print rand()*2}')
    done
}

# Check if duration is provided
DURATION=${1:-60}

echo "Running load simulation for $DURATION seconds..."
echo "Target: $API_GATEWAY_URL"
echo "Press Ctrl+C to stop early"

# Run multiple background processes to simulate concurrent load
for i in {1..5}; do
    simulate_load $DURATION &
done

# Wait for all background jobs to complete
wait

echo "Load simulation completed!"
echo "Check Grafana dashboard at http://localhost:3004 (admin/admin)"
echo "Check Prometheus at http://localhost:9090"