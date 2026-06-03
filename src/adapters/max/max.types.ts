import { z } from "zod";

const maxIdSchema = z.union([z.string(), z.number()]);

export const maxUserSchema = z.object({
  user_id: maxIdSchema.optional(),
  id: maxIdSchema.optional(),
  username: z.string().optional(),
  name: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional()
}).passthrough();

export const maxMessageSchema = z.object({
  mid: maxIdSchema.optional(),
  message_id: maxIdSchema.optional(),
  id: maxIdSchema.optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
  sender: maxUserSchema.optional(),
  recipient: z.object({
    chat_id: maxIdSchema.optional()
  }).passthrough().optional(),
  body: z.object({
    text: z.string().nullable().optional()
  }).passthrough().nullable().optional(),
  text: z.string().optional()
}).passthrough();

export const maxUpdateSchema = z.object({
  update_type: z.string().optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
  chat_id: maxIdSchema.optional(),
  user: maxUserSchema.optional(),
  message: maxMessageSchema.optional(),
  payload: z.string().nullable().optional(),
  user_id: maxIdSchema.optional(),
  message_id: maxIdSchema.optional(),
  text: z.string().optional(),
  username: z.string().optional(),
  display_name: z.string().optional()
}).passthrough();

export type MaxUpdate = z.infer<typeof maxUpdateSchema>;
