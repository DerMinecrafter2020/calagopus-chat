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
  lastActionStatus: z.enum(['pending', 'executing', 'confirmed', 'cancelled', 'failed', 'expired']).nullable(),
  unreadCount: z.number(),
  participants: z.array(z.string()),
});

export const conversationRefSchema = z.object({
  uuid: z.string().uuid(),
  kind: conversationKindSchema,
  title: z.string().nullable(),
});

export const aiServerActionSchema = z.object({
  actionType: z.enum(['start', 'stop', 'restart']),
  serverName: z.string(),
  status: z.enum(['pending', 'executing', 'confirmed', 'cancelled', 'failed', 'expired']),
  expiresAt: z.coerce.date(),
});

export const messageSchema = z.object({
  uuid: z.string().uuid(),
  conversationUuid: z.string().uuid(),
  senderUuid: z.string().uuid().nullable(),
  senderUsername: z.string(),
  isAi: z.boolean(),
  content: z.string(),
  createdAt: z.coerce.date(),
  pendingAction: aiServerActionSchema.nullable(),
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

export const aiServerActionDecisionSchema = z.object({
  confirm: z.boolean(),
});

export const aiServerActionResponseSchema = z.object({
  status: aiServerActionSchema.shape.status,
});

export const aiProviderSchema = z.enum([
  'openai_compatible',
  'openrouter',
  'anthropic',
  'google_gemini',
  'ollama',
]);

export const adminSettingsSchema = z.object({
  aiEnabled: z.boolean(),
  aiProvider: aiProviderSchema,
  aiBaseUrl: z.string(),
  aiModel: z.string(),
  aiSystemPrompt: z.string(),
  apiKeyConfigured: z.boolean(),
  aiServerInfoEnabled: z.boolean(),
  aiServerPowerEnabled: z.boolean(),
});

export const tokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reportedResponses: z.number().int().nonnegative(),
});

export const adminSettingsResponseSchema = z.object({
  settings: adminSettingsSchema,
  tokenUsage: tokenUsageSchema,
});

export const providerModelsRequestSchema = z.object({
  aiProvider: aiProviderSchema,
  aiBaseUrl: z.string().url().max(512),
  aiApiKey: z.string().max(4096),
});

export const providerModelsResponseSchema = z.object({
  models: z.array(z.string()),
});

export const updateAdminSettingsSchema = z.object({
  aiEnabled: z.boolean(),
  aiProvider: aiProviderSchema,
  aiBaseUrl: z.string().url().max(512),
  aiModel: z.string().trim().min(1).max(128),
  aiSystemPrompt: z.string().trim().min(1).max(4000),
  aiApiKey: z.string().max(4096),
  aiServerInfoEnabled: z.boolean(),
  aiServerPowerEnabled: z.boolean(),
  clearApiKey: z.boolean(),
});

export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationKind = z.infer<typeof conversationKindSchema>;
export type AiProvider = z.infer<typeof aiProviderSchema>;
export type TokenUsage = z.infer<typeof tokenUsageSchema>;
export type AiServerAction = z.infer<typeof aiServerActionSchema>;
export type ChatMessage = z.infer<typeof messageSchema>;
export type ChatUser = z.infer<typeof userSummarySchema>;
export type ProviderModelsRequest = z.infer<typeof providerModelsRequestSchema>;
export type UpdateAdminSettings = z.infer<typeof updateAdminSettingsSchema>;
