import { axiosInstance } from '@/api/axios.ts';

export default async (conversationUuid: string) => {
  await axiosInstance.delete(
    `/api/client/extensions/com.calagopus.chat/conversations/${conversationUuid}`,
  );
};
