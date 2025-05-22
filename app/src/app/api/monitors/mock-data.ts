// Mock data for monitors
export const mockMonitors = [
  {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Main Website",
    url: "https://example.com",
    method: "ping",
    status: "up",
    lastCheckedAt: new Date(Date.now() - 120000).toISOString(),
    responseTime: 342,
    uptime: 99.98,
    interval: 60,
    active: true,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440001",
    name: "API Service",
    url: "https://api.example.com/status",
    method: "get",
    status: "up",
    lastCheckedAt: new Date(Date.now() - 180000).toISOString(),
    responseTime: 157,
    uptime: 99.95,
    interval: 120,
    active: true,
    createdAt: new Date(Date.now() - 8600000).toISOString(),
    updatedAt: new Date(Date.now() - 4500000).toISOString()
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    name: "Payment Gateway",
    url: "https://payments.example.com/status",
    method: "get",
    status: "down",
    lastCheckedAt: new Date(Date.now() - 300000).toISOString(),
    responseTime: 0,
    uptime: 98.2,
    interval: 60,
    active: true,
    createdAt: new Date(Date.now() - 9100000).toISOString(),
    updatedAt: new Date(Date.now() - 2900000).toISOString()
  },

  {
    id: "550e8400-e29b-41d4-a716-446655440004",
    name: "Background Worker",
    url: "tcp://worker.example.com:8080",
    method: "tcp",
    status: "paused",
    lastCheckedAt: new Date(Date.now() - 3600000).toISOString(),
    responseTime: 45,
    uptime: 99.5,
    interval: 300,
    active: false,
    createdAt: new Date(Date.now() - 12000000).toISOString(),
    updatedAt: new Date(Date.now() - 6000000).toISOString()
  }
]; 