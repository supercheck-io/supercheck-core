import { z } from "zod"

// Schema for tests matching the database schema
export const testSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  script: z.string(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  type: z.enum(["browser", "api", "multistep", "database"]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export type Test = z.infer<typeof testSchema>
