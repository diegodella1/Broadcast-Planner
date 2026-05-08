import { z } from "zod"

export const loginSchema = z.object({
  token: z.string().min(1, "token is required").max(1000)
})
export type LoginInput = z.infer<typeof loginSchema>
