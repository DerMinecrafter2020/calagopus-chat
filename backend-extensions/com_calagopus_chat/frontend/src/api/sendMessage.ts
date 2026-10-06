import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi, serializeForApi } from '@/lib/serialization/api-transform.ts';
import { sendMessageResponseSchema, sendMessageSchema } from '../lib/schemas.ts';

export default async (conversationUuid: string, content: string) => {
  const { data } = await axiosInstance.post(
    `/api/client/extensions/com.calagopus.chat/conversations/${conversationUuid}/messages`,
    serializeForApi(sendMessageSchema, { content }),
  );
  return parseFromApi(sendMessageResponseSchema, data);
};
