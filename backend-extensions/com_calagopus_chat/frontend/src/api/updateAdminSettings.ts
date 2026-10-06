import { axiosInstance } from '@/api/axios.ts';
import { serializeForApi } from '@/lib/serialization/api-transform.ts';
import { updateAdminSettingsSchema, type UpdateAdminSettings } from '../lib/schemas.ts';

export default async (settings: UpdateAdminSettings) => {
  await axiosInstance.put(
    '/api/admin/extensions/com.calagopus.chat/settings',
    serializeForApi(updateAdminSettingsSchema, settings),
  );
};
