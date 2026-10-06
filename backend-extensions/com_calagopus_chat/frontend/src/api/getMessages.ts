import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi } from '@/lib/serialization/api-transform.ts';
import { messagesResponseSchema } from '../lib/schemas.ts';

export default async (conversationUuid: string) => {
  const { data } = await axiosInstance.get(
    `/api/client/extensions/com.calagopus.chat/conversations/${conversationUuid}/messages`,
  );
  return parseFromApi(messagesResponseSchema, data);
};
