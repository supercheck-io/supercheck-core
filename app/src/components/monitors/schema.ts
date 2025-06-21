import { z } from "zod";

// Schema for monitors matching the database schema
export const monitorSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  url: z.string(),
  type: z.enum(["ping", "get", "post", "tcp", "udp", "ssl", "heartbeat", "http_request", "port_check", "playwright_script"]).default("http_request"),
  frequencyMinutes: z.number().default(5),
  timeout: z.number().optional(),
  expectedStatus: z.number().optional(),
  expectedResponseBody: z.string().optional(),
  port: z.number().optional(),
  status: z.enum(["up", "down", "paused"]).default("up"),
  lastCheckedAt: z.string().optional(),
  responseTime: z.number().optional(),
  uptime: z.string().or(z.number()).optional(),
  active: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Monitor = z.infer<typeof monitorSchema>; 