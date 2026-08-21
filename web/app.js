import {
  ApiError,
  createConversation,
  createMessage,
  getConversations,
  getMessages,
  searchMessages
} from './api.js';
import { createRelaySocket } from './socket.js';

const currentUserId = 1;
const defaultParticipantIds = [currentUserId, 2];
const mobileViewport = window.matchMedia('(max-width: 760px)');

const elements = {
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
  cancelConversation: document.getElementById('cancelConversation'),
  createConversation: document.getElementById('createConversation'),
  searchForm: document.getElementById('searchForm'),
  search: document.getElementById('search'),
  clearSearch: document.getElementById('clearSearch'),
  backButton: document.getElementById('backButton'),
  connectionPill: document.getElementById('connectionPill'),
  chatConnectionBadge: document.getElementById('chatConnectionBadge'),
  chatConnectionLabel: document.getElementById('chatConnectionLabel'),
  toastRegion: document.getElementById('toastRegion')
};

const state = {
  conversations: [],
  activeConversationId: null,
  activeConversationTitle: null,
  messages: [],
  seenMessageIds: new Set(),
  view: 'welcome',
  loadingConversations: true,
  loadingMessages: false,
  sending: false,
  searchQuery: '',
  pendingMessage: null,
  messagesController: null,
  searchController: null
};

const relaySocket = createRelaySocket({
  getConversationIds: () => state.conversations.map(conversation => conversation.id),
  onMessage: receiveMessage,
  onStatus: renderConnectionStatus
});

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
    button.setAttribute(
      'aria-label',
      `${conversation.title}, ${pluralize(conversation.messageCount, 'message')}`
    );

    const avatar = createElement('span', 'avatar');
    renderAvatar(avatar, conversation.title);

    const copy = createElement('span', 'conversation-copy');
    const title = createElement('span', 'conversation-title', conversation.title);
    const preview = createElement(
      'span',
      'conversation-preview',
      conversation.messageCount
        ? pluralize(conversation.messageCount, 'message')
        : 'No messages yet'
    );
    copy.append(title, preview);

    const meta = createElement('span', 'conversation-meta');
    const time = createElement(
      'span',
      'conversation-time',
      formatActivity(conversation.lastMessage?.createdAt)
    );
    const count = createElement(
      'span',
      conversation.unreadCount ? 'unread-count' : 'message-count',
      String(conversation.unreadCount || conversation.messageCount)
    );
    meta.append(time, count);

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
  const own = message.senderId === currentUserId;
  const row = createElement('article', own ? 'message-row is-own' : 'message-row');
  const bubble = createElement('div', 'message-bubble');

  row.dataset.messageId = message.id;

  if (!own)
    bubble.appendChild(createElement('span', 'message-sender', `User #${message.senderId}`));

  const body = createElement('p', 'message-body', message.body);
  const footer = createElement('span', 'message-footer');
  footer.appendChild(createElement('time', '', formatMessageTime(message.createdAt)));
  if (own) footer.appendChild(createElement('span', 'delivery-check', '✓✓'));

  bubble.append(body, footer);
  row.appendChild(bubble);
  return row;
}

function renderMessages() {
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

  elements.messages.replaceChildren(rail);
  requestAnimationFrame(() => {
    elements.messages.scrollTop = elements.messages.scrollHeight;
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
  const messageCount = conversation?.messageCount ?? state.messages.length;
  elements.title.textContent = title;
  elements.chatStatus.textContent = pluralize(messageCount, 'message');
  renderAvatar(elements.chatAvatar, title);
}

function setComposerAvailability() {
  const available = Boolean(state.activeConversationId) && state.view === 'conversation';
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
    button.append(
      createElement('strong', '', resultTitle),
      createElement('span', '', result.body ?? '')
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
    const previous = state.conversations.find(item => item.id === conversation.id);
    return { ...conversation, unreadCount: previous?.unreadCount ?? 0 };
  });
}

async function loadConversations({ openId } = {}) {
  state.loadingConversations = true;
  renderConversations();

  try {
    const conversations = await getConversations(currentUserId);
    state.conversations = mergeUnreadState(conversations);
    state.loadingConversations = false;
    renderConversations();
    relaySocket.subscribe();

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

async function openConversation(id, title) {
  state.messagesController?.abort();
  state.searchController?.abort();

  state.activeConversationId = id;
  state.activeConversationTitle = title ?? getActiveConversation()?.title ?? null;
  state.view = 'conversation';
  state.loadingMessages = true;
  state.messages = [];

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
    const messages = await getMessages(id, controller.signal);
    if (controller !== state.messagesController) return;

    const liveMessages = state.messages.filter(message => message.conversationId === id);
    const merged = new Map(messages.map(message => [message.id, message]));
    for (const message of liveMessages) merged.set(message.id, message);

    state.messages = [...merged.values()].sort((left, right) => left.id - right.id);
    for (const message of state.messages) state.seenMessageIds.add(message.id);
    state.loadingMessages = false;
    renderHeader();
    setComposerAvailability();
    renderMessages();
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

function receiveMessage(message) {
  if (state.seenMessageIds.has(message.id)) return;
  state.seenMessageIds.add(message.id);

  const conversation = state.conversations.find(item => item.id === message.conversationId);
  const activeConversationVisible =
    message.conversationId === state.activeConversationId &&
    state.view === 'conversation' &&
    (!mobileViewport.matches || elements.app.classList.contains('is-chat-open'));

  if (conversation) {
    conversation.messageCount += 1;
    conversation.lastMessage = {
      id: message.id,
      senderId: message.senderId,
      createdAt: message.createdAt
    };

    if (!activeConversationVisible) {
      conversation.unreadCount = (conversation.unreadCount ?? 0) + 1;
    }
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
      senderId: currentUserId,
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

function openConversationDialog() {
  elements.newConversationForm.reset();
  elements.newConversationDialog.showModal();
  requestAnimationFrame(() => elements.conversationTitle.focus());
}

async function submitConversation(event) {
  event.preventDefault();
  const title = elements.conversationTitle.value.trim();
  if (!title) return;

  elements.createConversation.disabled = true;
  elements.createConversation.textContent = 'Creating…';

  try {
    const conversation = await createConversation(title, defaultParticipantIds);
    elements.newConversationDialog.close();
    await loadConversations({ openId: conversation.id });
    showToast('Conversation created.');
  } catch (error) {
    showToast(error.message ?? 'Conversation could not be created.', 'error');
  } finally {
    elements.createConversation.disabled = false;
    elements.createConversation.textContent = 'Create conversation';
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
elements.cancelConversation.addEventListener('click', () => elements.newConversationDialog.close());
elements.newConversationForm.addEventListener('submit', submitConversation);

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
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    elements.search.focus();
  }
});

window.addEventListener('beforeunload', () => relaySocket.close());

relaySocket.connect();
loadConversations();
