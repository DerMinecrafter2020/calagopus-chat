import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi, serializeForApi } from '@/lib/serialization/api-transform.ts';
import {
  createConversationResponseSchema,
  createConversationSchema,
} from '../lib/schemas.ts';

export default async (conversation: {
  kind: 'direct' | 'group' | 'ai';
  aiEnabled: boolean;
  title?: string;
  participantUuids: string[];
}) => {
  const { data } = await axiosInstance.post(
    '/api/client/extensions/com.calagopus.chat/conversations',
    serializeForApi(createConversationSchema, conversation),
  );
  return parseFromApi(createConversationResponseSchema, data);
};
