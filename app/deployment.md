# Deployment Guide for Kubernetes

## Environment Configuration

To run this application in a Kubernetes environment using BullMQ, you'll need to set up the following environment variables in your deployment:

```bash
# Database connection (PostgreSQL)
DATABASE_URL=postgres://user:password@postgres-service:5432/supertest

# Redis connection for BullMQ
REDIS_URL=redis://redis-service:6379

# Test execution settings
MAX_CONCURRENT_TESTS=2
TEST_EXECUTION_TIMEOUT_MS=900000  # 15 minutes

# Optional S3 storage for test reports
S3_BUCKET=supertest-reports
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key

# Application settings
APP_URL=http://your-service-url
NODE_ENV=production

# For Kubernetes deployments
# Set this to a unique string shared across all pods to enable stateless operation
SUPERTEST_REDIS_PREFIX=supertest
```

## Kubernetes Deployment Recommendations

### 1. Stateless Application Design

The application has been redesigned to be stateless by:

- Using Redis as the queue backend instead of PostgreSQL
- Storing job results in Redis (via BullMQ) rather than in-memory
- Using shared storage for test reports (S3)

### 2. Suggested Kubernetes Resources

#### Redis Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:latest
        ports:
        - containerPort: 6379
---
apiVersion: v1
kind: Service
metadata:
  name: redis-service
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
```

#### PostgreSQL Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:latest
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_USER
          value: "user"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
        - name: POSTGRES_DB
          value: "supertest"
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: postgres-service
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
```

#### Application Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: supertest
spec:
  replicas: 2  # Adjust based on your needs
  selector:
    matchLabels:
      app: supertest
  template:
    metadata:
      labels:
        app: supertest
    spec:
      containers:
      - name: supertest
        image: your-registry/supertest:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        - name: MAX_CONCURRENT_TESTS
          value: "2"
        - name: TEST_EXECUTION_TIMEOUT_MS
          value: "900000"
        - name: S3_BUCKET
          value: "supertest-reports"
        - name: S3_REGION
          value: "us-east-1"
        - name: S3_ACCESS_KEY_ID
          valueFrom:
            secretKeyRef:
              name: aws-credentials
              key: access-key
        - name: S3_SECRET_ACCESS_KEY
          valueFrom:
            secretKeyRef:
              name: aws-credentials
              key: secret-key
        - name: APP_URL
          value: "http://supertest-service"
        - name: NODE_ENV
          value: "production"
        - name: SUPERTEST_REDIS_PREFIX
          value: "supertest"
---
apiVersion: v1
kind: Service
metadata:
  name: supertest-service
spec:
  selector:
    app: supertest
  ports:
  - port: 80
    targetPort: 3000
```

### 3. Deployment Considerations

1. **Storage**:
   - Use S3 or an equivalent object storage service for storing test reports
   - Use PersistentVolumes for PostgreSQL data storage

2. **Scaling**:
   - The application can now be horizontally scaled since job processing is coordinated through Redis
   - Workers will automatically distribute jobs based on availability

3. **Monitoring**:
   - Monitor Redis memory and performance
   - Monitor worker pods with standard Kubernetes tools

4. **Worker Configuration**:
   - You can create dedicated worker deployments that only process jobs by setting environment variables to designate worker-only mode
   - Using separate deployments for API and workers allows for independent scaling

### 4. Making the Application Fully Stateless

For complete statelessness, you should:

1. Store all session data in Redis instead of memory
2. Use Redis for any caching
3. Move all file operations to object storage (S3)
4. Ensure all pods can be terminated at any time without data loss

By implementing these recommendations and using the BullMQ-based queue system, your application will be properly configured for Kubernetes deployments.
