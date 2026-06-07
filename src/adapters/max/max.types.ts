import { z } from "zod";

const maxIdSchema = z.union([z.string(), z.number()]);
const maxTimestampSchema = z.union([z.number(), z.string()]);

export const maxUserSchema = z.object({
  user_id: maxIdSchema.optional(),
  id: maxIdSchema.optional(),
  username: z.string().optional(),
  name: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional()
}).passthrough();

export const maxChatSchema = z.object({
  chat_id: maxIdSchema.optional(),
  id: maxIdSchema.optional(),
  type: z.string().optional(),
  title: z.string().optional()
}).passthrough();

export const maxMessageSchema = z.object({
  mid: maxIdSchema.optional(),
  message_id: maxIdSchema.optional(),
  id: maxIdSchema.optional(),
  timestamp: maxTimestampSchema.optional(),
  sender: maxUserSchema.optional(),
  recipient: maxChatSchema.optional(),
  body: z.object({
    text: z.string().nullable().optional()
  }).passthrough().nullable().optional(),
  text: z.string().optional()
}).passthrough();

export const maxCallbackSchema = z.object({
  timestamp: maxTimestampSchema.optional(),
  callback_id: z.string().optional(),
  payload: z.string().nullable().optional(),
  user: maxUserSchema.optional()
}).passthrough();

export const maxUpdateSchema = z.object({
  update_type: z.string().optional(),
  timestamp: maxTimestampSchema.optional(),
  chat_id: maxIdSchema.optional(),
  chat: maxChatSchema.optional(),
  user: maxUserSchema.optional(),
  message: maxMessageSchema.optional(),
  callback: maxCallbackSchema.optional(),
  payload: z.string().nullable().optional(),
  user_id: maxIdSchema.optional(),
  message_id: maxIdSchema.optional(),
  text: z.string().optional(),
  username: z.string().optional(),
  display_name: z.string().optional(),
  title: z.string().optional(),
  is_channel: z.boolean().nullable().optional()
}).passthrough();

export type MaxUpdate = z.infer<typeof maxUpdateSchema>;
