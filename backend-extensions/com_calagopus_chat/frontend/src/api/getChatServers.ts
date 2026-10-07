import { z } from 'zod';
import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi } from '@/lib/serialization/api-transform.ts';
import { chatServerOptionSchema } from '../lib/schemas.ts';

const SERVER_PAGE_SIZE = 50;

const responseSchema = z.object({
  servers: z.object({
    total: z.number().int().nonnegative(),
    data: z.array(chatServerOptionSchema),
  }),
});

export default async (search: string) => {
  const normalizedSearch = search.trim().slice(0, 128);
  const { data } = await axiosInstance.get('/api/client/servers', {
    params: {
      page: 1,
      per_page: SERVER_PAGE_SIZE,
      search: normalizedSearch || undefined,
    },
  });
  const response = parseFromApi(responseSchema, data);

  return {
    servers: response.servers.data,
    truncated: response.servers.total > response.servers.data.length,
  };
};
