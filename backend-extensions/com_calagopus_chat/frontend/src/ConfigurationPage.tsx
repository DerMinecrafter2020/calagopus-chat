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
import { useTranslations } from '@/providers/TranslationProvider.tsx';
import { useToast } from '@/providers/ToastProvider.tsx';
import getAdminSettings from './api/getAdminSettings.ts';
import getProviderModels from './api/getProviderModels.ts';
import updateAdminSettings from './api/updateAdminSettings.ts';
import {
  updateAdminSettingsSchema,
  type AiProvider,
  type UpdateAdminSettings,
} from './lib/schemas.ts';
import { useExtTranslations } from './translations.ts';

const providerPresets: Record<AiProvider, { baseUrl: string; model: string }> = {
  openai_compatible: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-haiku-latest',
  },
  google_gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
  },
};

export default function ConfigurationPage() {
  const { addToast } = useToast();
  const { t: tExt } = useExtTranslations();
  const { t: tPanel } = useTranslations();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);

  const providerOptions = [
    { value: 'openai_compatible', label: tExt('settings.providers.openaiCompatible', {}) },
    { value: 'openrouter', label: tExt('settings.providers.openrouter', {}) },
    { value: 'anthropic', label: tExt('settings.providers.anthropic', {}) },
    { value: 'google_gemini', label: tExt('settings.providers.googleGemini', {}) },
    { value: 'ollama', label: tExt('settings.providers.ollama', {}) },
  ];

  const providerDescription: Record<AiProvider, string> = {
    openai_compatible: tExt('settings.providers.openaiCompatibleDescription', {}),
    openrouter: tExt('settings.providers.openrouterDescription', {}),
    anthropic: tExt('settings.providers.anthropicDescription', {}),
    google_gemini: tExt('settings.providers.googleGeminiDescription', {}),
    ollama: tExt('settings.providers.ollamaDescription', {}),
  };

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
      addToast(tExt('settings.settingsSaved', {}), 'success');
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
          ? tExt('settings.modelsLoaded', { count: response.models.length })
          : tExt('settings.noModels', {}),
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
        <Text size='sm' c='dimmed'>{tExt('settings.loading', {})}</Text>
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
              <Text fw={700}>{tExt('settings.title', {})}</Text>
              <Text size='sm' c='dimmed'>
                {tExt('settings.description', {})}
              </Text>
            </div>
          </Group>

          <form onSubmit={form.onSubmit(doSave)} autoComplete='off'>
            <Stack gap='md'>
              <Switch
                label={tExt('settings.enableAi', {})}
                description={tExt('settings.enableAiDescription', {})}
                {...form.getInputProps('aiEnabled', { type: 'checkbox' })}
              />

              <Select
                label={tExt('settings.provider', {})}
                data={providerOptions}
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
                label={tExt('settings.baseUrl', {})}
                description={providerDescription[form.values.aiProvider]}
                placeholder={providerPresets[form.values.aiProvider].baseUrl}
                type='url'
                {...form.getInputProps('aiBaseUrl')}
              />

              <TextInput
                label={tExt('settings.model', {})}
                placeholder={providerPresets[form.values.aiProvider].model}
                {...form.getInputProps('aiModel')}
              />

              <Group align='flex-end' gap='xs' wrap='nowrap'>
                <Select
                  label={tExt('settings.availableModels', {})}
                  placeholder={
                    availableModels.length > 0
                      ? tExt('settings.chooseModel', {})
                      : tExt('settings.loadModelsFirst', {})
                  }
                  data={availableModels}
                  value={availableModels.includes(form.values.aiModel) ? form.values.aiModel : null}
                  onChange={(model) => {
                    if (model) form.setFieldValue('aiModel', model);
                  }}
                  searchable
                  clearable
                  nothingFoundMessage={tExt('settings.noMatchingModels', {})}
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
                  {tExt('settings.loadModels', {})}
                </Button>
              </Group>

              <PasswordInput
                label={tPanel('common.form.apiKey', {})}
                description={
                  apiKeyConfigured
                    ? tExt('settings.keepStoredKey', {})
                    : form.values.aiProvider === 'ollama'
                      ? tExt('settings.optionalOllamaKey', {})
                      : tExt('settings.encryptedKey', {})
                }
                leftSection={<FontAwesomeIcon icon={faLock} aria-hidden='true' />}
                autoComplete='new-password'
                placeholder={
                  apiKeyConfigured ? '••••••••••••••••' : tExt('settings.enterApiKey', {})
                }
                {...form.getInputProps('aiApiKey')}
              />

              <Checkbox
                label={tExt('settings.removeStoredKey', {})}
                disabled={!apiKeyConfigured}
                {...form.getInputProps('clearApiKey', { type: 'checkbox' })}
              />

              <Textarea
                label={tExt('settings.systemPrompt', {})}
                description={tExt('settings.systemPromptDescription', {})}
                minRows={3}
                maxRows={8}
                autosize
                {...form.getInputProps('aiSystemPrompt')}
              />

              {!apiKeyConfigured &&
                form.values.aiEnabled &&
                form.values.aiProvider !== 'ollama' && (
                <Alert color='yellow' title={tExt('settings.apiKeyRequired', {})}>
                  {tExt('settings.apiKeyRequiredDescription', {})}
                </Alert>
              )}

              <Group justify='flex-end'>
                <Button type='submit' loading={saving} disabled={!form.isValid()}>
                  {tPanel('common.button.save', {})}
                </Button>
              </Group>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Stack>
  );
}
