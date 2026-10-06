import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi } from '@/lib/serialization/api-transform.ts';
import { adminSettingsResponseSchema } from '../lib/schemas.ts';

export default async () => {
  const { data } = await axiosInstance.get('/api/admin/extensions/com.calagopus.chat/settings');
  return parseFromApi(adminSettingsResponseSchema, data);
};
