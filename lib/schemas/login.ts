import { z } from "zod"

export const loginSchema = z.object({
  handle: z.string().trim().min(1, "operator handle is required").max(80).optional(),
  token: z.string().min(1, "token is required").max(1000)
})
export type LoginInput = z.infer<typeof loginSchema>
