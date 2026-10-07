import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi, serializeForApi } from '@/lib/serialization/api-transform.ts';
import {
  aiServerActionDecisionSchema,
  aiServerActionResponseSchema,
} from '../lib/schemas.ts';

export default async (conversationUuid: string, messageUuid: string, confirm: boolean) => {
  const { data } = await axiosInstance.post(
    `/api/client/extensions/com.calagopus.chat/conversations/${conversationUuid}/actions/${messageUuid}`,
    serializeForApi(aiServerActionDecisionSchema, { confirm }),
  );
  return parseFromApi(aiServerActionResponseSchema, data);
};
