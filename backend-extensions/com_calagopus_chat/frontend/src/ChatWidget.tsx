import {
  faArrowLeft,
  faComments,
  faMinus,
  faPaperPlane,
  faPlus,
  faRobot,
  faUser,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { z } from 'zod';
import { httpErrorToHuman } from '@/api/axios.ts';
import { useUserSetting } from '@/lib/userSettings.ts';
import { useAuth } from '@/providers/AuthProvider.tsx';
import { useToast } from '@/providers/ToastProvider.tsx';
import { useTranslations } from '@/providers/TranslationProvider.tsx';
import createConversation from './api/createConversation.ts';
import getConversations from './api/getConversations.ts';
import getMessages from './api/getMessages.ts';
import getUsers from './api/getUsers.ts';
import markConversationRead from './api/markConversationRead.ts';
import postMessage from './api/sendMessage.ts';
import type { ChatMessage, ChatUser, Conversation, ConversationKind } from './lib/schemas.ts';
import { useExtTranslations } from './translations.ts';

function conversationIcon(kind: ConversationKind) {
  if (kind === 'ai') return faRobot;
  if (kind === 'group') return faUsers;
  return faUser;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function ChatWidget() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { t: tExt } = useExtTranslations();
  const { t: tPanel } = useTranslations();
  const [sendOnEnter, setSendOnEnter] = useUserSetting(
    'com.calagopus.chat::send_on_enter',
    z.boolean(),
    true,
  );
  const [expanded, setExpanded] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [activeConversationUuid, setActiveConversationUuid] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [composeMode, setComposeMode] = useState<ConversationKind | null>(null);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations],
  );
  const activeConversation = conversations.find(
    (conversation) => conversation.uuid === activeConversationUuid,
  );
  const getConversationTitle = (conversation: Conversation | undefined): string => {
    if (!conversation) return tExt('chat.conversation', {});
    if (conversation.kind === 'ai') return tExt('chat.aiTitle', {});
    if (conversation.kind === 'group') {
      if (conversation.title === 'Group chat') return tExt('chat.groupFallback', {});
      return conversation.title || conversation.participants.join(', ') || tExt('chat.groupFallback', {});
    }
    return conversation.participants[0] ?? tExt('chat.directFallback', {});
  };

  const loadConversations = useCallback(
    async (silent = false) => {
      try {
        const response = await getConversations();
        setConversations(response.conversations);
        setAiAvailable(response.aiAvailable);
      } catch (error) {
        if (!silent) addToast(httpErrorToHuman(error), 'error');
      }
    },
    [addToast],
  );

  useEffect(() => {
    if (!user) return;

    let active = true;
    const load = async (silent: boolean) => {
      try {
        if (!silent && expanded) setListLoading(true);
        const response = await getConversations();
        if (!active) return;
        setConversations(response.conversations);
        setAiAvailable(response.aiAvailable);
      } catch (error) {
        if (active && !silent) addToast(httpErrorToHuman(error), 'error');
      } finally {
        if (active && !silent && expanded) setListLoading(false);
      }
    };

    void load(!expanded);
    const interval = window.setInterval(() => void load(true), expanded ? 6000 : 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [expanded, user, addToast]);

  useEffect(() => {
    if (!expanded || !user || !activeConversationUuid) return;

    let active = true;
    let initialized = false;
    let lastReadMessageUuid: string | null = null;

    const load = async (silent: boolean) => {
      try {
        if (!silent) setMessagesLoading(true);
        const response = await getMessages(activeConversationUuid);
        if (!active) return;
        setMessages(response.messages);

        const lastMessage = response.messages[response.messages.length - 1]?.uuid ?? null;
        if (!initialized || lastMessage !== lastReadMessageUuid) {
          initialized = true;
          lastReadMessageUuid = lastMessage;
          try {
            await markConversationRead(activeConversationUuid);
            if (active) void loadConversations(true);
          } catch (error) {
            initialized = false;
            throw error;
          }
        }
      } catch (error) {
        if (active && !silent) addToast(httpErrorToHuman(error), 'error');
      } finally {
        if (active && !silent) setMessagesLoading(false);
      }
    };

    void load(false);
    const interval = window.setInterval(() => void load(true), 4000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [expanded, user, activeConversationUuid, addToast, loadConversations]);

  useEffect(() => {
    const element = messageListRef.current;
    if (!element) return;

    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    if (nearBottom) element.scrollTop = element.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!expanded || !user || !composeMode || composeMode === 'ai') return;

    let active = true;
    setUsersLoading(true);
    const timeout = window.setTimeout(() => {
      getUsers(search)
        .then((response) => {
          if (active) setUsers(response.users);
        })
        .catch((error) => {
          if (active) addToast(httpErrorToHuman(error), 'error');
        })
        .finally(() => {
          if (active) setUsersLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [expanded, user, composeMode, search, addToast]);

  const startConversation = async (
    kind: ConversationKind,
    participantUuids: string[] = [],
    title?: string,
  ) => {
    setCreating(true);
    try {
      const response = await createConversation({ kind, participantUuids, title });
      await loadConversations(true);
      setMessages([]);
      setActiveConversationUuid(response.conversation.uuid);
      setComposeMode(null);
      setSelectedUsers([]);
      setGroupTitle('');
      setSearch('');
    } catch (error) {
      addToast(httpErrorToHuman(error), 'error');
    } finally {
      setCreating(false);
    }
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const conversationUuid = activeConversationUuid;
    const content = draft.trim();
    if (!conversationUuid || !content || sending) return;

    setSending(true);
    setDraft('');
    try {
      await postMessage(conversationUuid, content);
      const response = await getMessages(conversationUuid);
      setMessages(response.messages);
      await markConversationRead(conversationUuid);
      await loadConversations(true);
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 502) {
        void getMessages(conversationUuid)
          .then((response) => setMessages(response.messages))
          .catch(() => undefined);
        void loadConversations(true);
      } else {
        setDraft(content);
      }
      addToast(httpErrorToHuman(error), 'error');
    } finally {
      setSending(false);
    }
  };

  const openNewChat = () => {
    setActiveConversationUuid(null);
    setComposeMode('direct');
    setSearch('');
    setUsers([]);
    setSelectedUsers([]);
    setGroupTitle('');
  };

  if (!user) return null;

  return (
    <aside
      className={`calagopus-chat-widget${expanded ? ' is-expanded' : ''}`}
      aria-label={tExt('chat.brand', {})}
    >
      {!expanded ? (
        <button
          type='button'
          className='calagopus-chat-collapsed'
          aria-label={
            unreadCount > 0
              ? tExt('chat.openUnread', { count: unreadCount })
              : tExt('chat.open', {})
          }
          aria-expanded={false}
          onClick={() => setExpanded(true)}
        >
          <span className='calagopus-chat-brand-icon'>
            <FontAwesomeIcon icon={faComments} aria-hidden='true' />
          </span>
          <span className='calagopus-chat-collapsed-copy'>
            <span className='calagopus-chat-collapsed-title'>
              {tExt('chat.collapsedTitle', {})}
            </span>
            <span className='calagopus-chat-collapsed-subtitle'>
              {tExt('chat.collapsedSubtitle', {})}
            </span>
          </span>
          {unreadCount > 0 && (
            <Badge
              size='sm'
              color='blue'
              variant='filled'
              aria-label={tExt('chat.unread', { count: unreadCount })}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </button>
      ) : (
        <div className='calagopus-chat-shell'>
          <header className='calagopus-chat-header'>
            {(activeConversationUuid || composeMode) && (
              <Tooltip label={tExt('chat.back', {})}>
                <ActionIcon
                  variant='subtle'
                  aria-label={tExt('chat.back', {})}
                  onClick={() => {
                    setActiveConversationUuid(null);
                    setComposeMode(null);
                  }}
                >
                  <FontAwesomeIcon icon={faArrowLeft} aria-hidden='true' />
                </ActionIcon>
              </Tooltip>
            )}
            <span className='calagopus-chat-brand-icon'>
              <FontAwesomeIcon
                icon={activeConversation ? conversationIcon(activeConversation.kind) : faComments}
                aria-hidden='true'
              />
            </span>
            <div className='calagopus-chat-header-copy'>
              <Text fw={700} size='sm' truncate>
                {activeConversationUuid
                  ? getConversationTitle(activeConversation)
                  : composeMode
                    ? tExt('chat.composeTitle', {})
                    : tExt('chat.brand', {})}
              </Text>
              <Text size='xs' c='dimmed' truncate>
                {activeConversation?.kind === 'ai'
                  ? tExt('chat.privateAiSubtitle', {})
                  : activeConversationUuid
                    ? activeConversation?.kind === 'group'
                      ? tExt('chat.groupSubtitle', {})
                      : tExt('chat.directSubtitle', {})
                    : composeMode
                      ? tExt('chat.composeSubtitle', {})
                      : tExt('chat.listSubtitle', {})}
              </Text>
            </div>
            {!activeConversationUuid && !composeMode && (
              <Tooltip label={tExt('chat.newConversation', {})}>
                <ActionIcon
                  variant='subtle'
                  aria-label={tExt('chat.newConversation', {})}
                  onClick={openNewChat}
                >
                  <FontAwesomeIcon icon={faPlus} aria-hidden='true' />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={tExt('chat.minimize', {})}>
              <ActionIcon
                variant='subtle'
                aria-label={tExt('chat.minimize', {})}
                onClick={() => setExpanded(false)}
              >
                <FontAwesomeIcon icon={faMinus} aria-hidden='true' />
              </ActionIcon>
            </Tooltip>
          </header>

          {activeConversationUuid ? (
            <div className='calagopus-chat-conversation'>
              <div className='calagopus-chat-messages' ref={messageListRef}>
                {messagesLoading && messages.length === 0 ? (
                  <div className='calagopus-chat-centered-state'>
                    <Loader size='sm' />
                  </div>
                ) : messages.length === 0 ? (
                  <div className='calagopus-chat-centered-state'>
                    <Text size='sm' c='dimmed'>{tExt('chat.noMessages', {})}</Text>
                  </div>
                ) : (
                  <Stack gap='xs'>
                    {messages.map((message) => (
                      <MessageBubble
                        key={message.uuid}
                        message={message}
                        own={message.senderUuid === user.uuid}
                        senderLabel={
                          message.isAi
                            ? tExt('chat.aiTitle', {})
                            : message.senderUuid
                              ? message.senderUsername
                              : tExt('chat.formerUser', {})
                        }
                      />
                    ))}
                  </Stack>
                )}
              </div>
              <form className='calagopus-chat-composer' onSubmit={send}>
                <Group className='calagopus-chat-composer-options' justify='space-between' gap='xs'>
                  <Switch
                    size='xs'
                    label={tExt('chat.enterSends', {})}
                    checked={sendOnEnter}
                    onChange={(event) => setSendOnEnter(event.currentTarget.checked)}
                  />
                  <Text size='xs' c='dimmed'>
                    {sendOnEnter
                      ? tExt('chat.shiftEnterNewLine', {})
                      : tExt('chat.controlEnterSends', {})}
                  </Text>
                </Group>
                <div className='calagopus-chat-composer-row'>
                  <Textarea
                    aria-label={tExt('chat.writeMessage', {})}
                    placeholder={tExt('chat.messagePlaceholder', {})}
                    value={draft}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      const sendShortcut = sendOnEnter
                        ? event.key === 'Enter' && !event.shiftKey
                        : event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.shiftKey;
                      if (sendShortcut) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    minRows={1}
                    maxRows={4}
                    autosize
                    maxLength={4000}
                    disabled={sending || (activeConversation?.kind === 'ai' && !aiAvailable)}
                  />
                  <Tooltip
                    label={
                      sendOnEnter
                        ? tExt('chat.sendTooltipEnter', {})
                        : tExt('chat.sendTooltipControlEnter', {})
                    }
                  >
                    <ActionIcon
                      type='submit'
                      size='lg'
                      variant='filled'
                      aria-label={tPanel('common.button.send', {})}
                      disabled={!draft.trim() || sending || (activeConversation?.kind === 'ai' && !aiAvailable)}
                      loading={sending}
                    >
                      <FontAwesomeIcon icon={faPaperPlane} aria-hidden='true' />
                    </ActionIcon>
                  </Tooltip>
                </div>
              </form>
              {activeConversation?.kind === 'ai' && !aiAvailable && (
                <Text className='calagopus-chat-ai-notice' size='xs' c='dimmed'>
                  {tExt('chat.aiNotConfigured', {})}
                </Text>
              )}
            </div>
          ) : composeMode ? (
            <div className='calagopus-chat-compose'>
              <Group grow gap='xs'>
                <Button
                  size='xs'
                  variant={composeMode === 'direct' ? 'filled' : 'default'}
                  onClick={() => {
                    setComposeMode('direct');
                    setSelectedUsers([]);
                  }}
                >
                  {tExt('chat.direct', {})}
                </Button>
                <Button
                  size='xs'
                  variant={composeMode === 'group' ? 'filled' : 'default'}
                  onClick={() => {
                    setComposeMode('group');
                    setSelectedUsers([]);
                  }}
                >
                  {tExt('chat.group', {})}
                </Button>
                <Button
                  size='xs'
                  variant={composeMode === 'ai' ? 'filled' : 'default'}
                  onClick={() => setComposeMode('ai')}
                  disabled={!aiAvailable}
                  leftSection={<FontAwesomeIcon icon={faRobot} aria-hidden='true' />}
                >
                  {tExt('chat.ai', {})}
                </Button>
              </Group>

              {composeMode === 'ai' ? (
                <Stack gap='sm' className='calagopus-chat-compose-ai'>
                  <Text size='sm' c='dimmed'>
                    {tExt('chat.privateAiDescription', {})}
                  </Text>
                  {!aiAvailable && (
                    <Paper withBorder radius='sm' p='sm'>
                      <Text size='sm' c='dimmed'>{tExt('chat.aiUnavailable', {})}</Text>
                    </Paper>
                  )}
                  <Button
                    onClick={() => void startConversation('ai')}
                    loading={creating}
                    disabled={!aiAvailable}
                    leftSection={<FontAwesomeIcon icon={faRobot} aria-hidden='true' />}
                  >
                    {tExt('chat.startAiChat', {})}
                  </Button>
                </Stack>
              ) : (
                <>
                  {composeMode === 'group' && (
                    <TextInput
                      label={tExt('chat.groupName', {})}
                      placeholder={tExt('chat.optionalGroupName', {})}
                      value={groupTitle}
                      onChange={(event) => setGroupTitle(event.currentTarget.value)}
                      maxLength={80}
                    />
                  )}
                  <TextInput
                    aria-label={tExt('chat.searchUsers', {})}
                    placeholder={tPanel('common.input.search', {})}
                    value={search}
                    onChange={(event) => setSearch(event.currentTarget.value)}
                  />
                  {composeMode === 'group' && (
                    <Text size='xs' c='dimmed'>
                      {tExt('chat.selectGroupPeople', {})}
                    </Text>
                  )}
                  <div className='calagopus-chat-user-results'>
                    {usersLoading ? (
                      <div className='calagopus-chat-centered-state'>
                        <Loader size='sm' />
                      </div>
                    ) : users.length === 0 ? (
                      <Text size='sm' c='dimmed' ta='center' py='md'>
                        {tExt('chat.noUsersFound', {})}
                      </Text>
                    ) : (
                      <Stack gap={4}>
                        {users.map((chatUser) => (
                          <UserOption
                            key={chatUser.uuid}
                            user={chatUser}
                            selected={selectedUsers.includes(chatUser.uuid)}
                            groupMode={composeMode === 'group'}
                            onSelect={() => {
                              if (composeMode === 'direct') {
                                void startConversation('direct', [chatUser.uuid]);
                              } else {
                                setSelectedUsers((current) =>
                                  current.includes(chatUser.uuid)
                                    ? current.filter((uuid) => uuid !== chatUser.uuid)
                                    : [...current, chatUser.uuid],
                                );
                              }
                            }}
                          />
                        ))}
                      </Stack>
                    )}
                  </div>
                  {composeMode === 'group' && (
                    <Button
                      onClick={() => void startConversation('group', selectedUsers, groupTitle)}
                      loading={creating}
                      disabled={selectedUsers.length < 2}
                      leftSection={<FontAwesomeIcon icon={faUsers} aria-hidden='true' />}
                    >
                      {tExt('chat.createGroup', { count: selectedUsers.length })}
                    </Button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className='calagopus-chat-list'>
              {listLoading && conversations.length === 0 ? (
                <div className='calagopus-chat-centered-state'>
                  <Loader size='sm' />
                </div>
              ) : conversations.length === 0 ? (
                <div className='calagopus-chat-centered-state calagopus-chat-empty'>
                  <FontAwesomeIcon icon={faComments} aria-hidden='true' />
                  <Text fw={600}>{tExt('chat.emptyTitle', {})}</Text>
                  <Text size='sm' c='dimmed' ta='center'>
                    {tExt('chat.emptyDescription', {})}
                  </Text>
                  <Button size='xs' onClick={openNewChat} leftSection={<FontAwesomeIcon icon={faPlus} />}>
                    {tExt('chat.newConversationButton', {})}
                  </Button>
                </div>
              ) : (
                <Stack gap={4}>
                  {conversations.map((conversation) => (
                    <button
                      type='button'
                      key={conversation.uuid}
                      className='calagopus-chat-conversation-row'
                      onClick={() => {
                        setMessages([]);
                        setActiveConversationUuid(conversation.uuid);
                      }}
                    >
                      <span className='calagopus-chat-row-icon'>
                        <FontAwesomeIcon icon={conversationIcon(conversation.kind)} aria-hidden='true' />
                      </span>
                      <span className='calagopus-chat-row-copy'>
                        <span className='calagopus-chat-row-title'>
                          {getConversationTitle(conversation)}
                        </span>
                        <span className='calagopus-chat-row-preview'>
                          {conversation.lastMessage ??
                            (conversation.kind === 'ai'
                              ? tExt('chat.composeTitle', {})
                              : tExt('chat.noMessagesPreview', {}))}
                        </span>
                      </span>
                      {conversation.unreadCount > 0 && (
                        <Badge size='xs' color='blue' variant='filled'>
                          {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                        </Badge>
                      )}
                    </button>
                  ))}
                </Stack>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function MessageBubble({
  message,
  own,
  senderLabel,
}: {
  message: ChatMessage;
  own: boolean;
  senderLabel: string;
}) {
  return (
    <div className={`calagopus-chat-message${own ? ' is-own' : ''}${message.isAi ? ' is-ai' : ''}`}>
      {!own && (
        <Text className='calagopus-chat-message-author' size='xs' c='dimmed'>
          {senderLabel}
        </Text>
      )}
      <Paper withBorder radius='md' p='xs' className='calagopus-chat-message-paper'>
        <Text size='sm' className='calagopus-chat-message-text' style={{ whiteSpace: 'pre-wrap' }}>
          {message.content}
        </Text>
      </Paper>
      <Text className='calagopus-chat-message-time' size='xs' c='dimmed'>
        {formatTime(message.createdAt)}
      </Text>
    </div>
  );
}

function UserOption({
  user,
  selected,
  groupMode,
  onSelect,
}: {
  user: ChatUser;
  selected: boolean;
  groupMode: boolean;
  onSelect: () => void;
}) {
  return (
    <button type='button' className='calagopus-chat-user-row' onClick={onSelect}>
      <span className='calagopus-chat-user-avatar'>{user.username.slice(0, 1).toUpperCase()}</span>
      <span className='calagopus-chat-user-name'>{user.username}</span>
      {groupMode && <Checkbox checked={selected} readOnly tabIndex={-1} aria-label={`Select ${user.username}`} />}
    </button>
  );
}
