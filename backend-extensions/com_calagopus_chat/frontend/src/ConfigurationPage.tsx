import { faLock, faRobot } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useForm } from '@mantine/form';
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { httpErrorToHuman } from '@/api/axios.ts';
import { useToast } from '@/providers/ToastProvider.tsx';
import getAdminSettings from './api/getAdminSettings.ts';
import updateAdminSettings from './api/updateAdminSettings.ts';
import {
  updateAdminSettingsSchema,
  type UpdateAdminSettings,
} from './lib/schemas.ts';

export default function ConfigurationPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);

  const form = useForm<UpdateAdminSettings>({
    initialValues: {
      aiEnabled: false,
      aiBaseUrl: 'https://api.openai.com/v1',
      aiModel: 'gpt-4o-mini',
      aiSystemPrompt: 'You are the Calagopus Chat assistant. Be helpful, clear, and concise.',
      aiApiKey: '',
      clearApiKey: false,
    },
    validateInputOnBlur: true,
    validate: zod4Resolver(updateAdminSettingsSchema),
  });

  useEffect(() => {
    let active = true;
    getAdminSettings()
      .then(({ settings }) => {
        if (!active) return;
        form.setValues({
          aiEnabled: settings.aiEnabled,
          aiBaseUrl: settings.aiBaseUrl,
          aiModel: settings.aiModel,
          aiSystemPrompt: settings.aiSystemPrompt,
          aiApiKey: '',
          clearApiKey: false,
        });
        setApiKeyConfigured(settings.apiKeyConfigured);
      })
      .catch((error) => {
        if (active) addToast(httpErrorToHuman(error), 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const doSave = async (values: UpdateAdminSettings) => {
    setSaving(true);
    try {
      await updateAdminSettings(values);
      if (values.clearApiKey) setApiKeyConfigured(false);
      else if (values.aiApiKey.trim()) setApiKeyConfigured(true);
      form.setFieldValue('aiApiKey', '');
      form.setFieldValue('clearApiKey', false);
      addToast('Chat settings saved.', 'success');
    } catch (error) {
      addToast(httpErrorToHuman(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Group justify='center' py='xl'>
        <Loader size='sm' />
        <Text size='sm' c='dimmed'>Loading chat settings…</Text>
      </Group>
    );
  }

  return (
    <Stack gap='md' className='calagopus-chat-settings'>
      <Paper withBorder radius='md' p='lg'>
        <Stack gap='md'>
          <Group gap='sm' align='flex-start'>
            <FontAwesomeIcon icon={faRobot} aria-hidden='true' />
            <div>
              <Text fw={700}>AI assistant</Text>
              <Text size='sm' c='dimmed'>
                Configure an OpenAI-compatible chat-completions endpoint. AI chat stays unavailable
                until it is enabled and a provider key is saved.
              </Text>
            </div>
          </Group>

          <form onSubmit={form.onSubmit(doSave)} autoComplete='off'>
            <Stack gap='md'>
              <Switch
                label='Enable AI chat'
                description='Allow panel users to create private AI conversations.'
                {...form.getInputProps('aiEnabled', { type: 'checkbox' })}
              />

              <TextInput
                label='Provider base URL'
                description='The extension appends /chat/completions. For example: https://api.openai.com/v1'
                placeholder='https://api.openai.com/v1'
                type='url'
                {...form.getInputProps('aiBaseUrl')}
              />

              <TextInput
                label='Model'
                placeholder='gpt-4o-mini'
                {...form.getInputProps('aiModel')}
              />

              <PasswordInput
                label='Provider API key'
                description={
                  apiKeyConfigured
                    ? 'A key is stored securely. Leave this blank to keep it unchanged.'
                    : 'The API key is encrypted in the Panel settings database.'
                }
                leftSection={<FontAwesomeIcon icon={faLock} aria-hidden='true' />}
                autoComplete='new-password'
                placeholder={apiKeyConfigured ? '••••••••••••••••' : 'Enter provider API key'}
                {...form.getInputProps('aiApiKey')}
              />

              <Checkbox
                label='Remove the stored API key'
                disabled={!apiKeyConfigured}
                {...form.getInputProps('clearApiKey', { type: 'checkbox' })}
              />

              <Textarea
                label='System prompt'
                description='This instruction is sent before the recent messages in every AI conversation.'
                minRows={3}
                maxRows={8}
                autosize
                {...form.getInputProps('aiSystemPrompt')}
              />

              {!apiKeyConfigured && form.values.aiEnabled && (
                <Alert color='yellow' title='API key required'>
                  Save a provider API key before users can start an AI conversation.
                </Alert>
              )}

              <Group justify='flex-end'>
                <Button type='submit' loading={saving} disabled={!form.isValid()}>
                  Save settings
                </Button>
              </Group>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Stack>
  );
}
