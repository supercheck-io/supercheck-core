# Traefik Integration for SuperTest

## 🎯 **Best Use Cases for Traefik**

### **1. Reverse Proxy & SSL Termination**
- **Automatic SSL certificates** with Let's Encrypt
- **Clean URLs** (e.g., `https://supertest.yourdomain.com`)
- **HTTP to HTTPS redirection**
- **Load balancing** across multiple instances

### **2. Service Discovery & Load Balancing**
- **Automatic service discovery** from Docker labels
- **Health checks** and automatic failover
- **Load balancing** between worker instances
- **Zero-downtime deployments**

### **3. API Gateway Features**
- **Rate limiting** for API endpoints
- **CORS handling** for cross-origin requests
- **Security headers** (HSTS, XSS protection, etc.)
- **Request/response logging**
- **Authentication middleware**

### **4. Development/Production Parity**
- **Same setup** works locally and in production
- **Consistent routing** across environments
- **Easy SSL certificate management**
- **Centralized configuration**

## 🚀 **Quick Start**

### **1. Local Development**
```bash
# Run setup script
./setup-traefik.sh

# Start with Traefik (local)
docker-compose -f docker-compose.traefik.yml up -d
```

### **2. Production Deployment**
```bash
# Update configuration
# 1. Edit traefik/traefik.yml (line 25): your-email@yourdomain.com
# 2. Edit docker-compose.production.yml: replace yourdomain.com with your domain
# 3. Update passwords in docker-compose.production.yml

# Start production stack
docker-compose -f docker-compose.production.yml up -d
```

## 📁 **File Structure**
```
supertest/
├── docker-compose.traefik.yml      # Local development with Traefik
├── docker-compose.production.yml   # Production deployment
├── setup-traefik.sh               # Setup script
├── traefik/
│   ├── traefik.yml               # Main Traefik configuration
│   ├── dynamic.yml               # Dynamic configuration (middleware)
│   ├── acme.json                 # SSL certificates storage
│   └── logs/                     # Traefik logs
└── TRAEFIK_README.md             # This file
```

## 🌐 **Access URLs**

### **Local Development**
- **App**: https://supertest.localhost
- **Traefik Dashboard**: https://traefik.localhost (admin:admin)
- **MinIO Console**: http://localhost:9001 (minioadmin:minioadmin)

### **Production**
- **App**: https://supertest.yourdomain.com
- **Traefik Dashboard**: https://traefik.yourdomain.com (admin:admin)
- **MinIO Console**: http://yourdomain.com:9001

## ⚙️ **Configuration**

### **Traefik Labels Explained**
```yaml
# Enable Traefik for this service
- "traefik.enable=true"

# Route based on hostname
- "traefik.http.routers.frontend.rule=Host(`supertest.yourdomain.com`)"

# Use HTTPS
- "traefik.http.routers.frontend.entrypoints=websecure"

# Automatic SSL certificates
- "traefik.http.routers.frontend.tls.certresolver=letsencrypt"

# Service port
- "traefik.http.services.frontend.loadbalancer.server.port=3000"

# Apply middleware
- "traefik.http.routers.frontend.middlewares=security-headers,compress"
```

### **Middleware Features**
- **Rate Limiting**: Prevents abuse of API endpoints
- **CORS**: Handles cross-origin requests
- **Security Headers**: HSTS, XSS protection, frame denial
- **Compression**: Gzip compression for better performance
- **Authentication**: Basic auth for Traefik dashboard

## 🔧 **Advanced Features**

### **1. API Rate Limiting**
```yaml
# Separate rate limits for API vs frontend
- "traefik.http.middlewares.api-rate-limit.ratelimit.average=50"
- "traefik.http.middlewares.api-rate-limit.ratelimit.burst=100"
```

### **2. Health Checks**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### **3. Load Balancing**
```yaml
deploy:
  replicas: 3  # Multiple worker instances
  resources:
    limits:
      cpus: '2.0'
      memory: 4G
```

### **4. SSL Certificate Management**
- **Automatic renewal** with Let's Encrypt
- **HTTP challenge** for certificate validation
- **Secure storage** in `acme.json`

## 🛡️ **Security Features**

### **1. Security Headers**
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000`

### **2. Rate Limiting**
- **Frontend**: 200 requests/second average, 400 burst
- **API**: 50 requests/second average, 100 burst

### **3. CORS Configuration**
- **Methods**: GET, POST, PUT, DELETE, OPTIONS
- **Headers**: Content-Type, Authorization, X-Requested-With
- **Origins**: Configurable (currently "*" for development)

## 📊 **Monitoring & Logging**

### **1. Traefik Dashboard**
- **URL**: https://traefik.yourdomain.com
- **Credentials**: admin:admin
- **Features**: Service status, metrics, logs

### **2. Access Logs**
```yaml
accessLog:
  filePath: "/var/log/traefik/access.log"
  format: json
```

### **3. Metrics**
```yaml
metrics:
  prometheus:
    addEntryPointsLabels: true
    addServicesLabels: true
```

## 🔄 **Deployment Workflow**

### **1. Development**
```bash
# Start local development
./setup-traefik.sh
docker-compose -f docker-compose.traefik.yml up -d
```

### **2. Staging**
```bash
# Test with staging domain
docker-compose -f docker-compose.production.yml up -d
```

### **3. Production**
```bash
# Deploy to production
# 1. Update domain names
# 2. Set secure passwords
# 3. Configure monitoring
docker-compose -f docker-compose.production.yml up -d
```

## 🚨 **Troubleshooting**

### **1. SSL Certificate Issues**
```bash
# Check certificate status
docker exec traefik cat /acme.json

# Restart Traefik
docker-compose restart traefik
```

### **2. Service Not Accessible**
```bash
# Check service labels
docker inspect supertest-frontend-1 | grep -A 10 Labels

# Check Traefik logs
docker-compose logs traefik
```

### **3. Rate Limiting Issues**
```bash
# Check rate limit configuration
docker exec traefik cat /etc/traefik/dynamic.yml

# Restart services
docker-compose restart frontend
```

## 📈 **Performance Benefits**

### **1. Load Balancing**
- **Automatic distribution** of requests
- **Health check failover**
- **Zero-downtime deployments**

### **2. Caching & Compression**
- **Gzip compression** for faster loading
- **Static file caching**
- **API response caching**

### **3. SSL Optimization**
- **HTTP/2 support**
- **OCSP stapling**
- **Automatic certificate renewal**

## 🎉 **Benefits Summary**

✅ **Automatic SSL certificates** with Let's Encrypt  
✅ **Load balancing** across multiple instances  
✅ **Rate limiting** to prevent abuse  
✅ **Security headers** for protection  
✅ **CORS handling** for API access  
✅ **Health checks** and failover  
✅ **Centralized logging** and monitoring  
✅ **Development/production parity**  
✅ **Zero-downtime deployments**  
✅ **Easy scaling** with Docker Swarm  

This Traefik integration provides enterprise-grade features for your SuperTest application with minimal configuration! 