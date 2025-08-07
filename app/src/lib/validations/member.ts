import { z } from "zod"

export const inviteMemberSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .max(255, "Email must be 255 characters or less"),
  role: z
    .enum(["project_viewer", "project_editor", "project_admin", "org_admin"], {
      errorMap: () => ({ message: "Please select a valid role" })
    }),
  selectedProjects: z
    .array(z.string())
    .min(1, "At least one project must be selected")
    .max(50, "Cannot select more than 50 projects"),
})

export const updateMemberSchema = z.object({
  role: z
    .enum(["project_viewer", "project_editor", "project_admin", "org_admin"], {
      errorMap: () => ({ message: "Please select a valid role" })
    }),
  selectedProjects: z
    .array(z.string())
    .min(1, "At least one project must be selected")
    .max(50, "Cannot select more than 50 projects"),
})

export type InviteMemberFormData = z.infer<typeof inviteMemberSchema>
export type UpdateMemberFormData = z.infer<typeof updateMemberSchema>
