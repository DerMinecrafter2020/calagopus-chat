import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi, serializeForApi } from '@/lib/serialization/api-transform.ts';
import {
  providerModelsRequestSchema,
  providerModelsResponseSchema,
  type ProviderModelsRequest,
} from '../lib/schemas.ts';

export default async (settings: ProviderModelsRequest) => {
  const { data } = await axiosInstance.post(
    '/api/admin/extensions/com.calagopus.chat/settings/models',
    serializeForApi(providerModelsRequestSchema, settings),
  );
  return parseFromApi(providerModelsResponseSchema, data);
};
