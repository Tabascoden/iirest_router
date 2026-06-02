import { z } from "zod";

export const telegramUpdateSchema = z.object({
  message: z.object({
    message_id: z.number(),
    date: z.number().optional(),
    text: z.string().optional(),
    chat: z.object({ id: z.union([z.string(), z.number()]) }),
    from: z.object({
      id: z.union([z.string(), z.number()]),
      username: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional()
    }).optional()
  }).optional()
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
