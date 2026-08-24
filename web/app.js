import {
  ApiError,
  createConversation,
  createMessage,
  getAccessToken,
  getConversations,
  getCurrentUser,
  getMessages,
  loginAccount,
  logoutAccount,
  markConversationRead,
  onSessionExpired,
  registerAccount,
  restoreSession,
  searchMessages,
  searchUsers
} from './api.js';
import { createRelaySocket } from './socket.js';

const mobileViewport = window.matchMedia('(max-width: 760px)');

const elements = {
  auth: document.getElementById('auth'),
  authLoading: document.getElementById('authLoading'),
  authForms: document.getElementById('authForms'),
  authEyebrow: document.getElementById('authEyebrow'),
  authTitle: document.getElementById('authTitle'),
  authDescription: document.getElementById('authDescription'),
  authSwitchPrompt: document.getElementById('authSwitchPrompt'),
  authSwitch: document.getElementById('authSwitch'),
  loginForm: document.getElementById('loginForm'),
  loginError: document.getElementById('loginError'),
  registerForm: document.getElementById('registerForm'),
  registerError: document.getElementById('registerError'),
  app: document.getElementById('app'),
  conversations: document.getElementById('conversations'),
  conversationListState: document.getElementById('conversationListState'),
  conversationTotal: document.getElementById('conversationTotal'),
  title: document.getElementById('title'),
  chatStatus: document.getElementById('chatStatus'),
  chatAvatar: document.getElementById('chatAvatar'),
  messages: document.getElementById('messages'),
  composer: document.getElementById('composer'),
  text: document.getElementById('text'),
  sendButton: document.getElementById('sendButton'),
  newConversationButton: document.getElementById('newConv'),
  newConversationDialog: document.getElementById('newConversationDialog'),
  newConversationForm: document.getElementById('newConversationForm'),
  conversationTitle: document.getElementById('conversationTitle'),
  participantSearch: document.getElementById('participantSearch'),
  participantResults: document.getElementById('participantResults'),
  participantStatus: document.getElementById('participantStatus'),
  selectedParticipants: document.getElementById('selectedParticipants'),
  cancelConversation: document.getElementById('cancelConversation'),
  createConversation: document.getElementById('createConversation'),
  searchForm: document.getElementById('searchForm'),
  search: document.getElementById('search'),
  clearSearch: document.getElementById('clearSearch'),
  backButton: document.getElementById('backButton'),
  connectionPill: document.getElementById('connectionPill'),
  chatConnectionBadge: document.getElementById('chatConnectionBadge'),
  chatConnectionLabel: document.getElementById('chatConnectionLabel'),
  profileAvatar: document.getElementById('profileAvatar'),
  profileName: document.getElementById('profileName'),
  profileEmail: document.getElementById('profileEmail'),
  logoutButton: document.getElementById('logoutButton'),
  toastRegion: document.getElementById('toastRegion')
};

const state = {
  user: null,
  authMode: 'login',
  conversations: [],
  activeConversationId: null,
  activeConversationTitle: null,
  messages: [],
  seenMessageIds: new Set(),
  view: 'welcome',
  loadingConversations: true,
  loadingMessages: false,
  loadingEarlierMessages: false,
  hasMoreMessages: false,
  sending: false,
  searchQuery: '',
  pendingMessage: null,
  messagesController: null,
  searchController: null,
  participantController: null,
  participantSearchTimer: null,
  participantUsers: [],
  selectedParticipants: new Map(),
  creatingConversation: false,
  pendingConversation: null,
  pendingRealtimeMessages: new Map(),
  conversationRefreshPromise: null,
  realtimeResyncPromise: null
};

let relaySocket = null;

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function pluralize(count, singular) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function initials(value) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'R';
  return words
    .slice(0, 2)
    .map(word => Array.from(word)[0])
    .join('')
    .toUpperCase();
}

function avatarHue(value) {
  const hash = Array.from(value).reduce((sum, character) => sum + character.codePointAt(0), 0);
  return 140 + (hash % 38);
}

function renderAvatar(element, label) {
  element.textContent = initials(label);
  element.style.setProperty('--avatar-hue', avatarHue(label));
}

function setFormError(element, message = '') {
  element.textContent = message;
  element.hidden = !message;
}

function setFormBusy(form, busy, busyLabel) {
  const button = form.querySelector('button[type="submit"]');
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.label;

  for (const field of form.querySelectorAll('input')) field.disabled = busy;
}

function renderAuthMode(mode) {
  state.authMode = mode;
  const registering = mode === 'register';
  elements.loginForm.hidden = registering;
  elements.registerForm.hidden = !registering;
  elements.authEyebrow.textContent = registering ? 'Join Relay' : 'Welcome back';
  elements.authTitle.textContent = registering ? 'Create your account' : 'Sign in to Relay';
  elements.authDescription.textContent = registering
    ? 'A few details and your conversations are ready to begin.'
    : 'Continue where your conversations left off.';
  elements.authSwitchPrompt.textContent = registering
    ? 'Already have an account?'
    : 'New to Relay?';
  elements.authSwitch.textContent = registering ? 'Sign in instead' : 'Create an account';
  setFormError(elements.loginError);
  setFormError(elements.registerError);

  requestAnimationFrame(() => {
    const field = registering
      ? elements.registerForm.elements.namedItem('name')
      : elements.loginForm.elements.namedItem('email');
    field?.focus();
  });
}

function showAuthentication(message = '') {
  elements.app.hidden = true;
  elements.auth.hidden = false;
  elements.authLoading.hidden = true;
  elements.authForms.hidden = false;
  renderAuthMode('login');
  setFormError(elements.loginError, message);
}

function resetApplicationState() {
  state.conversations = [];
  state.activeConversationId = null;
  state.activeConversationTitle = null;
  state.messages = [];
  state.seenMessageIds.clear();
  state.view = 'welcome';
  state.loadingConversations = true;
  state.loadingMessages = false;
  state.loadingEarlierMessages = false;
  state.hasMoreMessages = false;
  state.sending = false;
  state.searchQuery = '';
  state.pendingMessage = null;
  state.messagesController?.abort();
  state.searchController?.abort();
  state.participantController?.abort();
  clearTimeout(state.participantSearchTimer);
  state.selectedParticipants.clear();
  state.participantUsers = [];
  state.pendingConversation = null;
  state.pendingRealtimeMessages.clear();
  state.conversationRefreshPromise = null;
  state.realtimeResyncPromise = null;
  elements.app.classList.remove('is-chat-open');
  elements.search.value = '';
  elements.text.value = '';
}

async function enterApplication(user) {
  state.user = user;
  resetApplicationState();
  elements.auth.hidden = true;
  elements.app.hidden = false;
  elements.profileName.textContent = user.name;
  elements.profileEmail.textContent = user.email;
  renderAvatar(elements.profileAvatar, user.name);

  relaySocket?.close();
  relaySocket = createRelaySocket({
    getAccessToken,
    refreshAccessToken: restoreSession,
    onAuthenticationFailed: () => leaveApplication('Your session expired. Please sign in again.'),
    onMessage: receiveMessage,
    onResyncRequired: resyncRealtimeState,
    onStatus: renderConnectionStatus
  });
  relaySocket.connect();
  await loadConversations();
}

function leaveApplication(message = '') {
  relaySocket?.close();
  relaySocket = null;
  state.user = null;
  resetApplicationState();
  showAuthentication(message);
}

async function resolveSessionUser(session) {
  return session?.user ?? getCurrentUser();
}

async function submitLogin(event) {
  event.preventDefault();
  setFormError(elements.loginError);
  const data = new FormData(elements.loginForm);
  setFormBusy(elements.loginForm, true, 'Signing in…');

  try {
    const session = await loginAccount({
      email: String(data.get('email') ?? '').trim(),
      password: String(data.get('password') ?? '')
    });
    elements.loginForm.reset();
    await enterApplication(await resolveSessionUser(session));
  } catch (error) {
    setFormError(elements.loginError, error.message ?? 'Could not sign in. Please try again.');
  } finally {
    setFormBusy(elements.loginForm, false, '');
  }
}

async function submitRegistration(event) {
  event.preventDefault();
  setFormError(elements.registerError);

  const data = new FormData(elements.registerForm);
  const password = String(data.get('password') ?? '');
  const passwordConfirmation = String(data.get('passwordConfirmation') ?? '');

  if (password !== passwordConfirmation) {
    setFormError(elements.registerError, 'Passwords do not match.');
    elements.registerForm.elements.namedItem('passwordConfirmation')?.focus();
    return;
  }

  setFormBusy(elements.registerForm, true, 'Creating account…');

  try {
    const session = await registerAccount({
      name: String(data.get('name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      password,
      passwordConfirmation
    });
    elements.registerForm.reset();
    await enterApplication(await resolveSessionUser(session));
  } catch (error) {
    setFormError(
      elements.registerError,
      error.message ?? 'Could not create your account. Please try again.'
    );
  } finally {
    setFormBusy(elements.registerForm, false, '');
  }
}

async function signOut() {
  elements.logoutButton.disabled = true;

  try {
    await logoutAccount();
  } catch (error) {
    showToast(error.message ?? 'Could not close the session cleanly.', 'error');
  } finally {
    elements.logoutButton.disabled = false;
    leaveApplication();
  }
}

async function bootstrap() {
  elements.auth.hidden = false;
  elements.authLoading.hidden = false;
  elements.authForms.hidden = true;

  try {
    const session = await restoreSession();
    await enterApplication(await resolveSessionUser(session));
  } catch {
    showAuthentication();
  }
}

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatActivity(value) {
  const date = toDate(value);
  if (!date) return '';

  const now = new Date();
  if (isSameDay(date, now)) {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
  }).format(date);
}

function formatMessageTime(value) {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatMessageDate(value) {
  const date = toDate(value);
  if (!date) return '';

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric'
  }).format(date);
}

function sortedConversations() {
  return [...state.conversations].sort((left, right) => {
    const leftTime = toDate(left.lastMessage?.createdAt)?.getTime() ?? 0;
    const rightTime = toDate(right.lastMessage?.createdAt)?.getTime() ?? 0;
    return rightTime - leftTime || right.id - left.id;
  });
}

function getActiveConversation() {
  return state.conversations.find(conversation => conversation.id === state.activeConversationId);
}

function renderConversationSkeletons() {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < 4; index += 1) {
    const row = createElement('div', 'skeleton-conversation');
    const avatar = createElement('span', 'skeleton-avatar');
    const lines = createElement('span', 'skeleton-lines');
    lines.append(createElement('span', 'skeleton-line'), createElement('span', 'skeleton-line'));
    row.append(avatar, lines);
    fragment.appendChild(row);
  }

  elements.conversationListState.replaceChildren(fragment);
}

function renderConversationListState(title, description, actionLabel, action) {
  const container = createElement('div', 'list-empty');
  container.append(createElement('strong', '', title), createElement('span', '', description));

  if (actionLabel && action) {
    const button = createElement('button', 'state-action', actionLabel);
    button.type = 'button';
    button.addEventListener('click', action);
    container.appendChild(button);
  }

  elements.conversationListState.replaceChildren(container);
}

function renderConversations() {
  elements.conversations.replaceChildren();
  elements.conversationListState.replaceChildren();
  elements.conversationTotal.textContent = pluralize(state.conversations.length, 'conversation');

  if (state.loadingConversations) {
    renderConversationSkeletons();
    return;
  }

  if (!state.conversations.length) {
    renderConversationListState(
      'No conversations yet',
      'Create the first space for your team.',
      'New conversation',
      openConversationDialog
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const conversation of sortedConversations()) {
    const item = createElement('li', 'conversation-item');
    const button = createElement('button', 'conversation-card');
    button.type = 'button';
    button.setAttribute('aria-current', String(conversation.id === state.activeConversationId));
    button.setAttribute('aria-label', conversation.title);

    const avatar = createElement('span', 'avatar');
    renderAvatar(avatar, conversation.title);

    const copy = createElement('span', 'conversation-copy');
    const title = createElement('span', 'conversation-title', conversation.title);
    const preview = createElement(
      'span',
      'conversation-preview',
      conversation.lastMessage?.preview ?? 'No messages yet'
    );
    copy.append(title, preview);

    const meta = createElement('span', 'conversation-meta');
    const time = createElement(
      'span',
      'conversation-time',
      formatActivity(conversation.lastMessage?.createdAt)
    );
    meta.appendChild(time);

    if (conversation.unreadCount) {
      meta.appendChild(createElement('span', 'unread-count', String(conversation.unreadCount)));
    }

    button.append(avatar, copy, meta);
    button.addEventListener('click', () => openConversation(conversation.id, conversation.title));
    item.appendChild(button);
    fragment.appendChild(item);
  }

  elements.conversations.appendChild(fragment);
}

function createEmptyIllustration() {
  const illustration = createElement('div', 'empty-illustration');
  const orbit = createElement('span', 'empty-orbit');
  const mark = createElement('span', 'empty-mark', 'R');
  illustration.setAttribute('aria-hidden', 'true');
  illustration.append(orbit, mark);
  return illustration;
}

function renderMainState({ eyebrow, title, description, actionLabel, action }) {
  const container = createElement('section', 'empty-state');
  container.append(createEmptyIllustration());

  if (eyebrow) container.appendChild(createElement('p', 'eyebrow', eyebrow));
  container.append(createElement('h2', '', title), createElement('p', '', description));

  if (actionLabel && action) {
    const button = createElement('button', 'state-action', actionLabel);
    button.type = 'button';
    button.addEventListener('click', action);
    container.appendChild(button);
  }

  elements.messages.replaceChildren(container);
}

function renderWelcome() {
  state.view = 'welcome';
  renderHeader();
  setComposerAvailability();
  renderMainState({
    eyebrow: 'Your conversations, in sync',
    title: 'Stay close to what matters',
    description: 'Select a conversation from the sidebar or start a new one.'
  });
}

function renderMessageLoading() {
  const container = createElement('div', 'message-loading');
  for (let index = 0; index < 5; index += 1) {
    container.appendChild(createElement('span', 'message-skeleton'));
  }
  elements.messages.replaceChildren(container);
}

function createMessageElement(message) {
  const own = message.senderId === state.user?.id;
  const row = createElement('article', own ? 'message-row is-own' : 'message-row');
  const bubble = createElement('div', 'message-bubble');

  row.dataset.messageId = message.id;

  if (!own)
    bubble.appendChild(
      createElement('span', 'message-sender', message.senderName || 'Unknown user')
    );

  const body = createElement('p', 'message-body', message.body);
  const footer = createElement('span', 'message-footer');
  footer.appendChild(createElement('time', '', formatMessageTime(message.createdAt)));
  if (own) footer.appendChild(createElement('span', 'delivery-check', '✓✓'));

  bubble.append(body, footer);
  row.appendChild(bubble);
  return row;
}

function renderMessages({ preserveScroll = false } = {}) {
  if (state.loadingMessages) {
    renderMessageLoading();
    return;
  }

  if (!state.messages.length) {
    renderMainState({
      eyebrow: 'A fresh conversation',
      title: 'No messages here yet',
      description: 'Write the first message and start the conversation.'
    });
    return;
  }

  const container = elements.messages;
  const previousTop = container.scrollTop;
  const previousHeight = container.scrollHeight;
  const wasNearBottom = previousHeight - previousTop - container.clientHeight < 120;
  const rail = createElement('div', 'message-rail');
  let currentDate = '';

  for (const message of state.messages) {
    const messageDate = formatMessageDate(message.createdAt);
    if (messageDate && messageDate !== currentDate) {
      currentDate = messageDate;
      rail.appendChild(createElement('div', 'date-divider', messageDate));
    }
    rail.appendChild(createMessageElement(message));
  }

  container.replaceChildren(rail);

  requestAnimationFrame(() => {
    if (preserveScroll) {
      container.scrollTop = previousTop + (container.scrollHeight - previousHeight);
      return;
    }

    if (wasNearBottom) {
      container.scrollTop = container.scrollHeight;
      return;
    }

    container.scrollTop = previousTop;
  });
}

function renderHeader() {
  if (state.view === 'search') {
    elements.title.textContent = 'Search results';
    elements.chatStatus.textContent = state.searchQuery
      ? `Messages matching “${state.searchQuery}”`
      : 'Search messages';
    renderAvatar(elements.chatAvatar, 'Search');
    return;
  }

  const conversation = getActiveConversation();
  if (!conversation && !state.activeConversationId) {
    elements.title.textContent = 'Welcome to Relay';
    elements.chatStatus.textContent = 'Choose a conversation to start';
    renderAvatar(elements.chatAvatar, 'Relay');
    return;
  }

  const title =
    conversation?.title ??
    state.activeConversationTitle ??
    `Conversation #${state.activeConversationId}`;
  elements.title.textContent = title;
  elements.chatStatus.textContent = conversation?.lastMessage
    ? `Last activity ${formatActivity(conversation.lastMessage.createdAt)}`
    : 'No messages yet';
  renderAvatar(elements.chatAvatar, title);
}

function setComposerAvailability() {
  const available = !!state.activeConversationId && state.view === 'conversation';
  elements.text.disabled = !available || state.sending;
  elements.text.placeholder = available ? 'Write a message…' : 'Choose a conversation first';
  elements.sendButton.disabled = !available || state.sending || !elements.text.value.trim();
  elements.sendButton.classList.toggle('is-sending', state.sending);
}

function resizeComposer() {
  elements.text.style.height = 'auto';
  elements.text.style.height = `${Math.min(elements.text.scrollHeight, 132)}px`;
}

function renderSearchResults(query, results) {
  if (!results.length) {
    renderMainState({
      eyebrow: 'No matches',
      title: 'Nothing found yet',
      description: `We could not find messages matching “${query}”.`
    });
    return;
  }

  const container = createElement('section', 'search-results');
  container.appendChild(
    createElement('p', 'search-summary', `${pluralize(results.length, 'result')} for “${query}”`)
  );

  for (const result of results) {
    const button = createElement('button', 'search-result');
    button.type = 'button';
    const resultTitle = result.conversationTitle ?? `Conversation #${result.conversationId}`;
    const meta = result.senderName
      ? `${result.senderName} · ${formatActivity(result.createdAt)}`
      : '';
    button.append(
      createElement('strong', '', resultTitle),
      createElement('span', '', result.body ?? ''),
      createElement('span', 'search-result-meta', meta)
    );
    button.addEventListener('click', () => openConversation(result.conversationId, resultTitle));
    container.appendChild(button);
  }

  elements.messages.replaceChildren(container);
}

function renderSearchLoading() {
  const container = createElement('div', 'message-loading');
  for (let index = 0; index < 4; index += 1) {
    container.appendChild(createElement('span', 'message-skeleton'));
  }
  elements.messages.replaceChildren(container);
}

function renderConnectionStatus(status) {
  const labels = {
    connecting: 'Connecting',
    online: 'Live',
    offline: 'Offline'
  };
  elements.connectionPill.dataset.status = status;
  elements.connectionPill.textContent = labels[status] ?? status;
  elements.chatConnectionBadge.dataset.status = status;
  elements.chatConnectionLabel.textContent = labels[status] ?? status;
}

function showToast(message, type = 'success') {
  const toast = createElement('div', type === 'error' ? 'toast is-error' : 'toast', message);
  elements.toastRegion.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

function mergeUnreadState(conversations) {
  return conversations.map(conversation => {
    const activeConversationVisible =
      conversation.id === state.activeConversationId &&
      state.view === 'conversation' &&
      (!mobileViewport.matches || elements.app.classList.contains('is-chat-open'));
    return {
      ...conversation,
      unreadCount: activeConversationVisible ? 0 : (conversation.unreadCount ?? 0)
    };
  });
}

async function loadConversations({ openId } = {}) {
  state.loadingConversations = true;
  renderConversations();

  try {
    const conversations = await getConversations();
    state.conversations = mergeUnreadState(conversations);
    state.loadingConversations = false;
    renderConversations();

    const activeStillExists = state.conversations.some(
      conversation => conversation.id === state.activeConversationId
    );
    const firstConversation = sortedConversations()[0];
    const targetId = openId ?? (activeStillExists ? state.activeConversationId : null);

    if (targetId) {
      await openConversation(targetId);
    } else if (!mobileViewport.matches && firstConversation) {
      await openConversation(firstConversation.id, firstConversation.title);
    } else {
      renderWelcome();
    }
  } catch (error) {
    state.loadingConversations = false;
    renderConversationListState('Could not load conversations', error.message, 'Try again', () =>
      loadConversations()
    );
    renderWelcome();
  }
}

function markConversationReadOnServer(conversationId, throughMessageId) {
  if (!throughMessageId) return;
  markConversationRead(conversationId, throughMessageId).catch(() => undefined);
}

async function openConversation(id, title) {
  state.messagesController?.abort();
  state.searchController?.abort();

  state.activeConversationId = id;
  state.activeConversationTitle = title ?? getActiveConversation()?.title ?? null;
  state.view = 'conversation';
  state.loadingMessages = true;
  state.messages = [];
  state.hasMoreMessages = false;

  const conversation = getActiveConversation();
  if (conversation) conversation.unreadCount = 0;

  elements.app.classList.add('is-chat-open');
  renderConversations();
  renderHeader();
  setComposerAvailability();
  renderMessages();

  const controller = new AbortController();
  state.messagesController = controller;

  try {
    const messages = await getMessages(id, { limit: 30 }, controller.signal);
    if (controller !== state.messagesController) return;

    state.hasMoreMessages = messages.length === 30;
    const liveMessages = state.messages.filter(message => message.conversationId === id);
    const merged = new Map(messages.map(message => [message.id, message]));
    for (const message of liveMessages) merged.set(message.id, message);

    state.messages = [...merged.values()].sort((left, right) => left.id - right.id);
    for (const message of state.messages) state.seenMessageIds.add(message.id);
    state.loadingMessages = false;
    renderHeader();
    setComposerAvailability();
    renderMessages();
    markConversationReadOnServer(id, state.messages[state.messages.length - 1]?.id);
    requestAnimationFrame(maybeLoadEarlierMessages);
  } catch (error) {
    if (error.name === 'AbortError') return;
    state.loadingMessages = false;
    renderMainState({
      eyebrow: 'Connection issue',
      title: 'Messages could not be loaded',
      description: error.message,
      actionLabel: 'Try again',
      action: () => openConversation(id, title)
    });
    setComposerAvailability();
  }
}

function maybeLoadEarlierMessages() {
  if (state.view !== 'conversation' || !state.hasMoreMessages || state.loadingEarlierMessages) {
    return;
  }

  const nearTop = elements.messages.scrollTop < 200;
  const noScrollbar = elements.messages.scrollHeight <= elements.messages.clientHeight;
  if (nearTop || noScrollbar) void loadEarlierMessages();
}

function prependMessagesToRail(olderMessages) {
  const container = elements.messages;
  const rail = container.querySelector('.message-rail');

  if (!rail) {
    renderMessages({ preserveScroll: true });
    return;
  }

  const fragment = document.createDocumentFragment();
  let currentDate = '';

  for (const message of olderMessages) {
    const messageDate = formatMessageDate(message.createdAt);
    if (messageDate && messageDate !== currentDate) {
      currentDate = messageDate;
      fragment.appendChild(createElement('div', 'date-divider', messageDate));
    }
    fragment.appendChild(createMessageElement(message));
  }

  const leadingDivider = rail.firstElementChild;
  if (
    leadingDivider?.classList.contains('date-divider') &&
    leadingDivider.textContent === currentDate
  ) {
    leadingDivider.remove();
  }

  const previousHeight = container.scrollHeight;
  const previousTop = container.scrollTop;
  rail.prepend(fragment);
  container.scrollTop = previousTop + (container.scrollHeight - previousHeight);
}

async function loadEarlierMessages() {
  const conversationId = state.activeConversationId;
  const oldestMessageId = state.messages[0]?.id;
  if (!conversationId || !oldestMessageId || state.loadingEarlierMessages) return;

  state.loadingEarlierMessages = true;

  try {
    const messages = await getMessages(conversationId, { beforeId: oldestMessageId, limit: 30 });
    if (state.activeConversationId !== conversationId) return;

    state.hasMoreMessages = messages.length === 30;
    const knownIds = new Set(state.messages.map(message => message.id));
    const olderMessages = messages.filter(message => !knownIds.has(message.id));
    if (!olderMessages.length) return;

    state.messages = [...olderMessages, ...state.messages];
    for (const message of olderMessages) state.seenMessageIds.add(message.id);
    prependMessagesToRail(olderMessages);
  } catch (error) {
    showToast(error.message ?? 'Earlier messages could not be loaded.', 'error');
  } finally {
    state.loadingEarlierMessages = false;
  }
}

function receiveMessage(message) {
  if (state.seenMessageIds.has(message.id)) return;
  state.seenMessageIds.add(message.id);

  const conversation = state.conversations.find(item => item.id === message.conversationId);

  if (!conversation) {
    const pendingMessages = state.pendingRealtimeMessages.get(message.conversationId) ?? [];
    pendingMessages.push(message);
    state.pendingRealtimeMessages.set(message.conversationId, pendingMessages);
    void refreshConversationsForRealtime();
    return;
  }

  const activeConversationVisible =
    message.conversationId === state.activeConversationId &&
    state.view === 'conversation' &&
    (!mobileViewport.matches || elements.app.classList.contains('is-chat-open'));

  conversation.lastMessage = {
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    preview: message.body.slice(0, 300),
    createdAt: message.createdAt
  };

  if (!activeConversationVisible && message.senderId !== state.user?.id) {
    conversation.unreadCount = (conversation.unreadCount ?? 0) + 1;
  }

  if (activeConversationVisible && message.senderId !== state.user?.id) {
    markConversationReadOnServer(message.conversationId, message.id);
  }

  if (message.conversationId === state.activeConversationId && state.view === 'conversation') {
    state.messages.push(message);
    state.messages.sort((left, right) => left.id - right.id);
    state.loadingMessages = false;
    renderMessages();
    renderHeader();
  }

  renderConversations();
}

async function refreshConversationsForRealtime() {
  if (state.conversationRefreshPromise) return state.conversationRefreshPromise;

  state.conversationRefreshPromise = (async () => {
    const userId = state.user?.id;
    const pendingMessagesByConversation = new Map(state.pendingRealtimeMessages);
    for (const conversationId of pendingMessagesByConversation.keys()) {
      state.pendingRealtimeMessages.delete(conversationId);
    }
    let refreshSucceeded = false;

    try {
      const conversations = await getConversations();
      if (state.user?.id !== userId) return;
      state.conversations = mergeUnreadState(conversations);
      renderConversations();
      refreshSucceeded = true;
    } catch (error) {
      for (const [conversationId, messages] of pendingMessagesByConversation) {
        const queuedMessages = state.pendingRealtimeMessages.get(conversationId) ?? [];
        state.pendingRealtimeMessages.set(conversationId, [...messages, ...queuedMessages]);
      }
      showToast(error.message ?? 'Conversations could not be refreshed.', 'error');
    } finally {
      state.conversationRefreshPromise = null;
      if (refreshSucceeded && state.pendingRealtimeMessages.size) {
        void refreshConversationsForRealtime();
      }
    }
  })();

  return state.conversationRefreshPromise;
}

async function resyncRealtimeState() {
  if (state.realtimeResyncPromise) return state.realtimeResyncPromise;

  const userId = state.user?.id;
  if (!userId) return;

  const activeConversationId = state.activeConversationId;
  const shouldReloadActiveConversation = !!activeConversationId && state.view === 'conversation';

  state.realtimeResyncPromise = (async () => {
    const conversations = await getConversations();
    if (state.user?.id !== userId) return;

    state.conversations = mergeUnreadState(conversations);
    renderConversations();
    renderHeader();

    if (
      !shouldReloadActiveConversation ||
      state.activeConversationId !== activeConversationId ||
      state.view !== 'conversation'
    ) {
      return;
    }

    const messages = await getMessages(activeConversationId, { limit: 30 });
    if (
      state.user?.id !== userId ||
      state.activeConversationId !== activeConversationId ||
      state.view !== 'conversation'
    ) {
      return;
    }

    const mergedMessages = new Map(messages.map(message => [message.id, message]));
    for (const message of state.messages) mergedMessages.set(message.id, message);

    state.messages = [...mergedMessages.values()].sort((left, right) => left.id - right.id);
    for (const message of state.messages) state.seenMessageIds.add(message.id);
    renderMessages();
    renderHeader();
    markConversationReadOnServer(
      activeConversationId,
      state.messages[state.messages.length - 1]?.id
    );
  })()
    .catch(error => {
      showToast(error.message ?? 'Realtime state could not be synchronized.', 'error');
    })
    .finally(() => {
      state.realtimeResyncPromise = null;
    });

  return state.realtimeResyncPromise;
}

async function submitMessage(event) {
  event.preventDefault();
  const body = elements.text.value.trim();
  if (!body || !state.activeConversationId || state.sending) return;

  const pendingMessage =
    state.pendingMessage?.body === body
      ? state.pendingMessage
      : { body, clientId: crypto.randomUUID() };

  state.pendingMessage = pendingMessage;
  state.sending = true;
  setComposerAvailability();

  try {
    const message = await createMessage({
      conversationId: state.activeConversationId,
      body,
      clientId: pendingMessage.clientId
    });
    receiveMessage(message);
    state.pendingMessage = null;
    elements.text.value = '';
    resizeComposer();
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      const retryMessage = error.retryAfter
        ? `Too many messages. Try again in ${error.retryAfter} seconds.`
        : 'Too many messages. Please wait and try again.';
      showToast(retryMessage, 'error');
    } else {
      showToast(error.message ?? 'Message could not be sent.', 'error');
    }
  } finally {
    state.sending = false;
    setComposerAvailability();
    elements.text.focus();
  }
}

function updateCreateConversationButton() {
  elements.createConversation.disabled =
    state.creatingConversation || !state.selectedParticipants.size;
  elements.createConversation.textContent = state.creatingConversation
    ? 'Creating…'
    : 'Create conversation';
}

function renderSelectedParticipants() {
  elements.selectedParticipants.replaceChildren();

  for (const user of state.selectedParticipants.values()) {
    const chip = createElement('span', 'participant-chip');
    chip.appendChild(createElement('span', '', user.name));

    const remove = createElement('button', '', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${user.name}`);
    remove.addEventListener('click', () => {
      state.selectedParticipants.delete(user.id);
      state.pendingConversation = null;
      renderSelectedParticipants();
      renderParticipantResults();
      updateCreateConversationButton();
    });
    chip.appendChild(remove);
    elements.selectedParticipants.appendChild(chip);
  }

  elements.selectedParticipants.hidden = !state.selectedParticipants.size;
}

function renderParticipantResults() {
  elements.participantResults.replaceChildren();

  if (!state.participantUsers.length) {
    elements.participantStatus.textContent = 'No people found.';
    return;
  }

  elements.participantStatus.textContent = state.selectedParticipants.size
    ? `${pluralize(state.selectedParticipants.size, 'person')} selected`
    : 'Choose at least one person.';

  for (const user of state.participantUsers) {
    const selected = state.selectedParticipants.has(user.id);
    const button = createElement(
      'button',
      selected ? 'participant-result is-selected' : 'participant-result'
    );
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(selected));

    const avatar = createElement('span', 'avatar participant-avatar');
    renderAvatar(avatar, user.name);
    const copy = createElement('span', 'participant-copy');
    copy.append(createElement('strong', '', user.name), createElement('small', '', user.email));
    const action = createElement('span', 'participant-action', selected ? 'Selected' : 'Add');
    button.append(avatar, copy, action);
    button.addEventListener('click', () => {
      if (selected) state.selectedParticipants.delete(user.id);
      else state.selectedParticipants.set(user.id, user);
      state.pendingConversation = null;
      renderSelectedParticipants();
      renderParticipantResults();
      updateCreateConversationButton();
    });
    elements.participantResults.appendChild(button);
  }
}

async function loadParticipantUsers(query) {
  state.participantController?.abort();
  const controller = new AbortController();
  state.participantController = controller;
  elements.participantStatus.textContent = 'Searching…';
  elements.participantResults.replaceChildren();

  try {
    const result = await searchUsers(query, controller.signal);
    if (controller !== state.participantController) return;
    const users = Array.isArray(result) ? result : (result?.users ?? []);
    state.participantUsers = users.filter(user => user.id !== state.user?.id);
    renderParticipantResults();
  } catch (error) {
    if (error.name === 'AbortError') return;
    state.participantUsers = [];
    elements.participantStatus.textContent =
      error.message ?? 'People could not be loaded. Please try again.';
  }
}

function openConversationDialog() {
  elements.newConversationForm.reset();
  state.selectedParticipants.clear();
  state.participantUsers = [];
  state.pendingConversation = null;
  renderSelectedParticipants();
  updateCreateConversationButton();
  elements.participantResults.replaceChildren();
  elements.participantStatus.textContent = 'Loading people…';
  elements.newConversationDialog.showModal();
  void loadParticipantUsers('');
  requestAnimationFrame(() => elements.conversationTitle.focus());
}

function closeConversationDialog() {
  state.participantController?.abort();
  clearTimeout(state.participantSearchTimer);
  elements.newConversationDialog.close();
}

async function submitConversation(event) {
  event.preventDefault();
  const title = elements.conversationTitle.value.trim();
  const participantIds = [...state.selectedParticipants.keys()].sort((left, right) => left - right);
  if (!title || !participantIds.length || state.creatingConversation) return;

  const fingerprint = JSON.stringify({ title, participantIds });
  const pendingConversation =
    state.pendingConversation?.fingerprint === fingerprint
      ? state.pendingConversation
      : { fingerprint, clientId: crypto.randomUUID() };

  state.pendingConversation = pendingConversation;
  state.creatingConversation = true;
  updateCreateConversationButton();

  try {
    const result = await createConversation(title, participantIds, pendingConversation.clientId);
    const conversation = result?.conversation ?? result;
    state.pendingConversation = null;
    closeConversationDialog();
    await loadConversations({ openId: conversation.id });
    showToast('Conversation created.');
  } catch (error) {
    showToast(error.message ?? 'Conversation could not be created.', 'error');
  } finally {
    state.creatingConversation = false;
    updateCreateConversationButton();
  }
}

async function performSearch(query) {
  state.messagesController?.abort();
  state.searchController?.abort();
  state.view = 'search';
  state.searchQuery = query;
  elements.app.classList.add('is-chat-open');
  renderHeader();
  setComposerAvailability();
  renderSearchLoading();

  const controller = new AbortController();
  state.searchController = controller;

  try {
    const results = await searchMessages(query, controller.signal);
    if (controller !== state.searchController) return;
    renderSearchResults(query, results);
  } catch (error) {
    if (error.name === 'AbortError') return;
    renderMainState({
      eyebrow: 'Search unavailable',
      title: 'We could not search messages',
      description: error.message,
      actionLabel: 'Try again',
      action: () => performSearch(query)
    });
  }
}

function clearSearch() {
  state.searchController?.abort();
  state.searchQuery = '';
  state.view = state.activeConversationId ? 'conversation' : 'welcome';
  elements.search.value = '';
  elements.clearSearch.hidden = true;
  renderHeader();
  setComposerAvailability();

  if (mobileViewport.matches) elements.app.classList.remove('is-chat-open');
  if (state.activeConversationId) renderMessages();
  else renderWelcome();
}

elements.messages.addEventListener('scroll', maybeLoadEarlierMessages);
elements.composer.addEventListener('submit', submitMessage);
elements.text.addEventListener('input', () => {
  if (state.pendingMessage?.body !== elements.text.value.trim()) state.pendingMessage = null;
  resizeComposer();
  setComposerAvailability();
});
elements.text.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
});

elements.newConversationButton.addEventListener('click', openConversationDialog);
elements.cancelConversation.addEventListener('click', closeConversationDialog);
elements.newConversationForm.addEventListener('submit', submitConversation);
elements.conversationTitle.addEventListener('input', () => {
  state.pendingConversation = null;
});
elements.participantSearch.addEventListener('input', () => {
  clearTimeout(state.participantSearchTimer);
  state.participantSearchTimer = setTimeout(
    () => loadParticipantUsers(elements.participantSearch.value.trim()),
    240
  );
});
elements.newConversationDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeConversationDialog();
});

elements.searchForm.addEventListener('submit', event => {
  event.preventDefault();
  const query = elements.search.value.trim();
  if (query) performSearch(query);
  else clearSearch();
});
elements.search.addEventListener('input', () => {
  elements.clearSearch.hidden = !elements.search.value;
});
elements.search.addEventListener('keydown', event => {
  if (event.key === 'Escape') clearSearch();
});
elements.clearSearch.addEventListener('click', clearSearch);

elements.backButton.addEventListener('click', () => {
  elements.app.classList.remove('is-chat-open');
});

document.addEventListener('keydown', event => {
  if (!elements.app.hidden && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    elements.search.focus();
  }
});

elements.loginForm.addEventListener('submit', submitLogin);
elements.registerForm.addEventListener('submit', submitRegistration);
elements.authSwitch.addEventListener('click', () => {
  renderAuthMode(state.authMode === 'login' ? 'register' : 'login');
});
elements.logoutButton.addEventListener('click', signOut);

onSessionExpired(() => leaveApplication('Your session expired. Please sign in again.'));
window.addEventListener('beforeunload', () => relaySocket?.close());

void bootstrap();
