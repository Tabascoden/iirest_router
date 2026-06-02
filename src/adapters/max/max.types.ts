import { z } from "zod";

export const maxUpdateSchema = z.object({
  user_id: z.union([z.string(), z.number()]),
  chat_id: z.union([z.string(), z.number()]),
  message_id: z.union([z.string(), z.number()]),
  text: z.string().optional(),
  username: z.string().optional(),
  display_name: z.string().optional()
});
