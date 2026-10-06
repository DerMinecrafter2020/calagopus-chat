import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi } from '@/lib/serialization/api-transform.ts';
import { z } from 'zod';

export default async (conversationUuid: string) => {
  const { data } = await axiosInstance.put(
    `/api/client/extensions/com.calagopus.chat/conversations/${conversationUuid}/read`,
  );
  parseFromApi(z.object({}), data);
};
