import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi } from '@/lib/serialization/api-transform.ts';
import { conversationsResponseSchema } from '../lib/schemas.ts';

export default async () => {
  const { data } = await axiosInstance.get('/api/client/extensions/com.calagopus.chat/conversations');
  return parseFromApi(conversationsResponseSchema, data);
};
