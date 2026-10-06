import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi } from '@/lib/serialization/api-transform.ts';
import { usersResponseSchema } from '../lib/schemas.ts';

export default async (search: string) => {
  const { data } = await axiosInstance.get('/api/client/extensions/com.calagopus.chat/users', {
    params: { search },
  });
  return parseFromApi(usersResponseSchema, data);
};
