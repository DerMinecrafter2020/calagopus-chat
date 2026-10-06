import { z } from 'zod';

export const conversationKindSchema = z.enum(['direct', 'group', 'ai']);

export const userSummarySchema = z.object({
  uuid: z.string().uuid(),
  username: z.string(),
});

export const conversationSchema = z.object({
  uuid: z.string().uuid(),
  kind: conversationKindSchema,
  title: z.string().nullable(),
  createdAt: z.coerce.date(),
  lastMessage: z.string().nullable(),
  lastMessageAt: z.coerce.date().nullable(),
  unreadCount: z.number(),
  participants: z.array(z.string()),
});

export const conversationRefSchema = z.object({
  uuid: z.string().uuid(),
  kind: conversationKindSchema,
  title: z.string().nullable(),
});

export const messageSchema = z.object({
  uuid: z.string().uuid(),
  conversationUuid: z.string().uuid(),
  senderUuid: z.string().uuid().nullable(),
  senderUsername: z.string(),
  isAi: z.boolean(),
  content: z.string(),
  createdAt: z.coerce.date(),
});

export const conversationsResponseSchema = z.object({
  conversations: z.array(conversationSchema),
  aiAvailable: z.boolean(),
});

export const usersResponseSchema = z.object({
  users: z.array(userSummarySchema),
});

export const createConversationSchema = z.object({
  kind: conversationKindSchema,
  title: z.string().optional(),
  participantUuids: z.array(z.string().uuid()),
});

export const createConversationResponseSchema = z.object({
  conversation: conversationRefSchema,
});

export const messagesResponseSchema = z.object({
  messages: z.array(messageSchema),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const sendMessageResponseSchema = z.object({
  messageUuid: z.string().uuid(),
  aiMessageUuid: z.string().uuid().nullable(),
});

export const adminSettingsSchema = z.object({
  aiEnabled: z.boolean(),
  aiBaseUrl: z.string(),
  aiModel: z.string(),
  aiSystemPrompt: z.string(),
  apiKeyConfigured: z.boolean(),
});

export const adminSettingsResponseSchema = z.object({
  settings: adminSettingsSchema,
});

export const updateAdminSettingsSchema = z.object({
  aiEnabled: z.boolean(),
  aiBaseUrl: z.string().url().max(512),
  aiModel: z.string().trim().min(1).max(128),
  aiSystemPrompt: z.string().trim().min(1).max(4000),
  aiApiKey: z.string().max(4096),
  clearApiKey: z.boolean(),
});

export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationKind = z.infer<typeof conversationKindSchema>;
export type ChatMessage = z.infer<typeof messageSchema>;
export type ChatUser = z.infer<typeof userSummarySchema>;
export type UpdateAdminSettings = z.infer<typeof updateAdminSettingsSchema>;
