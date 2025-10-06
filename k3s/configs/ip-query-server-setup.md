# IP Query Server Setup for Large K3s Clusters

This document explains how to set up the IP query server required for large K3s clusters (50+ nodes) when using Hetzner-k3s without private networks.

## Overview

For large clusters, Hetzner's private networks (which only support up to 100 nodes) need to be disabled. This requires a custom firewall solution that dynamically updates allowed IPs based on the Hetzner API.

## Prerequisites

- A Docker-enabled server (can be a small Hetzner server)
- Your Hetzner Cloud API token
- A domain name for the IP query server (optional but recommended)

## Setup Instructions

### 1. Create the IP Query Server

Create a new directory for the IP query server:

```bash
mkdir ip-query-server
cd ip-query-server
```

### 2. Create the Docker Compose File

Create a `docker-compose.yml` file:

```yaml
version: "3.8"
services:
  ip-query-server:
    build: ./ip-query-server
    ports:
      - "8080:80"
    environment:
      - HETZNER_TOKEN=your_token_here
  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
    depends_on:
      - ip-query-server
```

### 3. Create the Caddyfile

Create a `Caddyfile` for SSL termination:

```
ip-query.example.com {
    reverse_proxy ip-query-server:80

    # Email for Let's Encrypt certificates
    email mail@example.com

    # Enable automatic HTTPS
    encode gzip

    # Security headers
    header {
        # Enable HSTS
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        # Prevent content type sniffing
        X-Content-Type-Options nosniff
        # Enable XSS protection
        X-XSS-Protection "1; mode=block"
        # Prevent framing
        X-Frame-Options DENY
    }
}
```

Replace `ip-query.example.com` with your actual domain name and `mail@example.com` with your email address.

### 4. Create the IP Query Server Application

Create a subdirectory `ip-query-server` and add the following files:

#### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 80

CMD ["node", "server.js"]
```

#### package.json

```json
{
  "name": "hetzner-ip-query-server",
  "version": "1.0.0",
  "description": "IP query server for Hetzner K3s large clusters",
  "main": "server.js",
  "dependencies": {
    "express": "^4.18.2",
    "@hetzner-cloud/js": "^2.0.0",
    "cors": "^2.8.5"
  }
}
```

#### server.js

```javascript
const express = require("express");
const { HCClient } = require("@hetzner-cloud/js");
const cors = require("cors");

const app = express();
const port = 80;

// Enable CORS for all routes
app.use(cors());

// Initialize Hetzner Cloud client
const client = HCClient.createFromToken(process.env.HETZNER_TOKEN);

// Cache for server IPs to avoid API rate limits
let cachedIps = null;
let lastFetch = 0;
const CACHE_DURATION = 30000; // 30 seconds

// Fetch server IPs from Hetzner API
async function fetchServerIps() {
  const now = Date.now();

  // Return cached IPs if still valid
  if (cachedIps && now - lastFetch < CACHE_DURATION) {
    return cachedIps;
  }

  try {
    const servers = await client.servers.list();
    const ips = servers.map((server) => server.publicNet.ipv4.ip);

    // Update cache
    cachedIps = ips;
    lastFetch = now;

    console.log(`Fetched ${ips.length} server IPs from Hetzner API`);
    return ips;
  } catch (error) {
    console.error("Error fetching server IPs:", error);

    // Return cached IPs even if expired, or empty array if no cache
    return cachedIps || [];
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Main endpoint to get server IPs
app.get("/ips", async (req, res) => {
  try {
    const ips = await fetchServerIps();
    res.json({ ips, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Error in /ips endpoint:", error);
    res.status(500).json({ error: "Failed to fetch IPs" });
  }
});

// Start server
app.listen(port, "0.0.0.0", () => {
  console.log(`IP query server listening on port ${port}`);

  // Initial fetch
  fetchServerIps();
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully");
  process.exit(0);
});
```

### 5. Deploy the Server

```bash
# Start the services
docker-compose up -d

# Check logs
docker-compose logs -f

# Test the endpoint
curl https://ip-query.example.com/ips
```

### 6. Update Your K3s Configuration

In your large cluster configuration file, update the following:

```yaml
networking:
  public_network:
    hetzner_ips_query_server_url: https://ip-query.example.com
    use_local_firewall: true
  private_network:
    enabled: false
```

## High Availability Setup

For production large clusters, consider setting up 2-3 instances of the IP query server behind a load balancer:

1. Deploy the IP query server on multiple small Hetzner servers
2. Use Hetzner Load Balancer to distribute traffic
3. Update the configuration to use the load balancer URL

## Security Considerations

- The IP query server exposes your server IPs, so ensure it's properly secured
- Use HTTPS with valid certificates
- Consider adding authentication if required
- Monitor the server for unusual activity
- Regularly rotate the Hetzner API token

## Troubleshooting

### Common Issues

1. **API Rate Limits**: The server caches IPs for 30 seconds to avoid rate limits
2. **Network Connectivity**: Ensure the K3s nodes can reach the IP query server
3. **Firewall Rules**: Check that port 80/443 is open on the IP query server

### Monitoring

Monitor the following:

- API response times
- Error rates
- Number of IPs returned
- Cache hit/miss ratios

## Maintenance

- Regularly update the Docker images
- Monitor Hetzner API changes
- Check logs for errors
- Backup the configuration files
