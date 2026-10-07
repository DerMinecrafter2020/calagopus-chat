import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi } from '@/lib/serialization/api-transform.ts';
import { chatServerResourcesSchema } from '../lib/schemas.ts';

export default async (serverUuid: string) => {
  const { data } = await axiosInstance.get(`/api/client/servers/${serverUuid}/resources`);
  return parseFromApi(chatServerResourcesSchema, data.resources);
};
