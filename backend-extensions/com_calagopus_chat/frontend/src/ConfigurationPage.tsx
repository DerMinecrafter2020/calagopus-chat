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
  Select,
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
import getProviderModels from './api/getProviderModels.ts';
import updateAdminSettings from './api/updateAdminSettings.ts';
import {
  updateAdminSettingsSchema,
  type AiProvider,
  type UpdateAdminSettings,
} from './lib/schemas.ts';

const providerPresets: Record<AiProvider, { label: string; baseUrl: string; model: string; description: string }> = {
  openai_compatible: {
    label: 'OpenAI-compatible (OpenAI, Groq, DeepSeek, Mistral, Together, etc.)',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    description: 'Use a Chat Completions-compatible endpoint and set its base URL below.',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    description: 'Use an OpenRouter model id, for example openai/gpt-4o-mini.',
  },
  anthropic: {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-haiku-latest',
    description: 'Uses Anthropic Messages API. Set a Claude model id below.',
  },
  google_gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    description: 'Uses the Gemini generateContent API. Set a Gemini model id below.',
  },
  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    description: 'Uses Ollama’s OpenAI-compatible endpoint. Enter a URL reachable from the Panel; an API key is optional.',
  },
};

export default function ConfigurationPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);

  const form = useForm<UpdateAdminSettings>({
    initialValues: {
      aiEnabled: false,
      aiProvider: 'openai_compatible',
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
          aiProvider: settings.aiProvider,
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

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const response = await getProviderModels({
        aiProvider: form.values.aiProvider,
        aiBaseUrl: form.values.aiBaseUrl,
        aiApiKey: form.values.aiApiKey,
      });
      setAvailableModels(response.models);
      addToast(
        response.models.length > 0
          ? `Loaded ${response.models.length} models.`
          : 'The provider returned no models.',
        response.models.length > 0 ? 'success' : 'warning',
      );
    } catch (error) {
      addToast(httpErrorToHuman(error), 'error');
    } finally {
      setLoadingModels(false);
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
                Choose a provider, model, and credentials. AI chat stays unavailable until enabled
                and the selected provider is configured.
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

              <Select
                label='AI provider'
                data={Object.entries(providerPresets).map(([value, preset]) => ({
                  value,
                  label: preset.label,
                }))}
                value={form.values.aiProvider}
                onChange={(value) => {
                  if (!value) return;
                  const provider = value as AiProvider;
                  form.setFieldValue('aiProvider', provider);
                  form.setFieldValue('aiBaseUrl', providerPresets[provider].baseUrl);
                  form.setFieldValue('aiModel', providerPresets[provider].model);
                  setAvailableModels([]);
                }}
                allowDeselect={false}
              />

              <TextInput
                label='Provider base URL'
                description={providerPresets[form.values.aiProvider].description}
                placeholder={providerPresets[form.values.aiProvider].baseUrl}
                type='url'
                {...form.getInputProps('aiBaseUrl')}
              />

              <TextInput
                label='Model'
                placeholder={providerPresets[form.values.aiProvider].model}
                {...form.getInputProps('aiModel')}
              />

              <Group align='flex-end' gap='xs' wrap='nowrap'>
                <Select
                  label='Available models'
                  placeholder={
                    availableModels.length > 0 ? 'Choose a model' : 'Load models from the provider'
                  }
                  data={availableModels}
                  value={availableModels.includes(form.values.aiModel) ? form.values.aiModel : null}
                  onChange={(model) => {
                    if (model) form.setFieldValue('aiModel', model);
                  }}
                  searchable
                  clearable
                  nothingFoundMessage='No matching models'
                  style={{ flex: 1 }}
                />
                <Button
                  type='button'
                  variant='default'
                  loading={loadingModels}
                  disabled={
                    form.values.aiProvider !== 'ollama' &&
                    !apiKeyConfigured &&
                    !form.values.aiApiKey.trim()
                  }
                  onClick={() => void loadModels()}
                >
                  Load models
                </Button>
              </Group>

              <PasswordInput
                label='Provider API key'
                description={
                  apiKeyConfigured
                    ? 'A key is stored securely. Leave this blank to keep it unchanged.'
                    : form.values.aiProvider === 'ollama'
                      ? 'Optional for a local Ollama endpoint.'
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

              {!apiKeyConfigured &&
                form.values.aiEnabled &&
                form.values.aiProvider !== 'ollama' && (
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
