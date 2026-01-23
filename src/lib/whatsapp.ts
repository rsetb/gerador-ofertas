import { EventEmitter } from 'events';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';

type WhatsAppConnectionStatus = 'idle' | 'initializing' | 'qr' | 'ready' | 'disconnected' | 'error';

type WhatsAppEvent =
  | { type: 'state'; data: { status: WhatsAppConnectionStatus; qr: string | null; lastError: string | null } }
  | { type: 'qr'; data: { qr: string } }
  | { type: 'ready'; data: Record<string, never> }
  | { type: 'disconnected'; data: { reason: string } }
  | { type: 'auth_failure'; data: { message: string } }
  | { type: 'message'; data: { from: string; body: string; id: string } }
  | { type: 'error'; data: { message: string } };

type WhatsAppState = {
  status: WhatsAppConnectionStatus;
  qr: string | null;
  lastError: string | null;
  initialized: boolean;
  listenersAttached: boolean;
  injectedPatched: boolean;
};

type WhatsAppSingleton = {
  client: Client;
  state: WhatsAppState;
  emitter: EventEmitter;
};

declare global {
  var __adcproWhatsapp: WhatsAppSingleton | undefined;
}

const createClient = () => {
  return new Client({
    authStrategy: new LocalAuth({ clientId: 'adceletrodomesticos' }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  });
};

const createSingleton = (): WhatsAppSingleton => {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  const client = createClient();

  const state: WhatsAppState = {
    status: 'idle',
    qr: null,
    lastError: null,
    initialized: false,
    listenersAttached: false,
    injectedPatched: false,
  };

  return { client, state, emitter };
};

const getSingleton = (): WhatsAppSingleton => {
  if (!globalThis.__adcproWhatsapp) {
    globalThis.__adcproWhatsapp = createSingleton();
  }
  return globalThis.__adcproWhatsapp;
};

const emitState = () => {
  const { state, emitter } = getSingleton();
  emitter.emit('event', { type: 'state', data: { status: state.status, qr: state.qr, lastError: state.lastError } } satisfies WhatsAppEvent);
};

const patchInjectedWWebJSIfNeeded = async () => {
  const { client, state } = getSingleton();
  if (state.injectedPatched) return;
  const page = (client as any)?.pupPage;
  if (!page?.evaluate) return;

  try {
    await page.evaluate(() => {
      const w = window as any;
      if (w.__adcproWWebJSPatched) return;
      if (!w.WWebJS?.processMediaData) return;
      const original = w.WWebJS.processMediaData;

      w.WWebJS.processMediaData = async (mediaInfo: any, opts: any) => {
        const res = await original(mediaInfo, opts);
        const forceDocument = !!opts?.forceDocument;
        if (!forceDocument) return res;
        if (!res || typeof res !== 'object') return res;
        const preview = (res as any).preview;
        if (typeof preview !== 'string') {
          (res as any).preview = '';
        }
        return res;
      };

      w.__adcproWWebJSPatched = true;
    });
    state.injectedPatched = true;
  } catch {}
};

const attachListenersIfNeeded = () => {
  const { client, state, emitter } = getSingleton();
  if (state.listenersAttached) return;
  state.listenersAttached = true;

  client.on('qr', (qr: string) => {
    state.status = 'qr';
    state.qr = qr;
    state.lastError = null;
    emitter.emit('event', { type: 'qr', data: { qr } } satisfies WhatsAppEvent);
    emitState();
  });

  client.on('ready', () => {
    state.status = 'ready';
    state.qr = null;
    state.lastError = null;
    emitter.emit('event', { type: 'ready', data: {} } satisfies WhatsAppEvent);
    emitState();
    void patchInjectedWWebJSIfNeeded();
  });

  client.on('auth_failure', (message: string) => {
    state.status = 'error';
    state.lastError = message || 'auth_failure';
    emitter.emit('event', { type: 'auth_failure', data: { message: message || 'auth_failure' } } satisfies WhatsAppEvent);
    emitState();
  });

  client.on('disconnected', (reason: string) => {
    state.status = 'disconnected';
    state.lastError = reason || null;
    emitter.emit('event', { type: 'disconnected', data: { reason: reason || '' } } satisfies WhatsAppEvent);
    emitState();
  });

  client.on('message', (msg: any) => {
    const from = String(msg?.from || '');
    const body = String(msg?.body || '');
    const id = String(msg?.id?._serialized || msg?.id || '');
    emitter.emit('event', { type: 'message', data: { from, body, id } } satisfies WhatsAppEvent);
  });
};

export const getWhatsAppStatus = () => {
  const { state } = getSingleton();
  return { status: state.status, qr: state.qr, lastError: state.lastError };
};

export const resetWhatsApp = async () => {
  const singleton = getSingleton();
  try {
    try {
      (singleton.client as any)?.removeAllListeners?.();
    } catch {}
    await singleton.client.destroy();
  } catch {}

  singleton.client = createClient();
  singleton.state.status = 'idle';
  singleton.state.qr = null;
  singleton.state.lastError = null;
  singleton.state.initialized = false;
  singleton.state.listenersAttached = false;
  singleton.state.injectedPatched = false;
  attachListenersIfNeeded();
  emitState();
  return getWhatsAppStatus();
};

export const startWhatsApp = async () => {
  const { client, state, emitter } = getSingleton();
  attachListenersIfNeeded();

  if (state.status === 'ready' || state.status === 'initializing' || state.status === 'qr') {
    return getWhatsAppStatus();
  }

  state.status = 'initializing';
  state.lastError = null;
  emitter.emit('event', { type: 'state', data: { status: state.status, qr: state.qr, lastError: state.lastError } } satisfies WhatsAppEvent);

  if (!state.initialized) {
    state.initialized = true;
    try {
      await client.initialize();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha ao inicializar WhatsApp.';
      state.status = 'error';
      state.lastError = message;
      state.initialized = false;
      emitter.emit('event', { type: 'error', data: { message } } satisfies WhatsAppEvent);
      emitState();
    }
  }

  return getWhatsAppStatus();
};

const resolveWhatsAppChatId = async (client: Client, numberOrChatId: string) => {
  const input = (numberOrChatId || '').trim();
  if (!input) throw new Error('Número inválido.');

  const resolveSelfChatId = () => {
    const wid = (client as any)?.info?.wid;
    const serialized = String(wid?._serialized || wid || '').trim();
    if (serialized.includes('@')) return serialized;
    return '';
  };

  const normalizeDigits = (raw: string) => {
    let digits = (raw || '').replace(/\D/g, '');
    while (digits.startsWith('55') && digits.length > 13) {
      digits = digits.slice(2);
    }
    if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
      digits = `55${digits}`;
    }
    return digits;
  };

  const inputLower = input.toLowerCase();
  if (inputLower === 'me' || inputLower === 'self') {
    const chatId = resolveSelfChatId();
    if (!chatId) {
      throw new Error('Não foi possível resolver o número do WhatsApp conectado.');
    }
    return chatId;
  }

  if (input.includes('@')) return input;

  const digits = normalizeDigits(input);
  if (!digits) throw new Error('Número inválido.');
  try {
    const numberId = await (client as any).getNumberId(digits);
    const chatId = String(numberId?._serialized || '');
    if (chatId) return chatId;
  } catch {}
  throw new Error('Este número não está no WhatsApp.');
};

export const sendWhatsAppMessage = async (numberOrChatId: string, message: string) => {
  const { client } = getSingleton();
  const status = await startWhatsApp();
  if (status.status !== 'ready') {
    throw new Error('WhatsApp não está conectado.');
  }

  const text = (message || '').toString();
  if (!text.trim()) {
    throw new Error('Mensagem vazia.');
  }
  const chatId = await resolveWhatsAppChatId(client, numberOrChatId);
  await patchInjectedWWebJSIfNeeded();

  try {
    await client.sendMessage(chatId, text, { sendSeen: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/no lid for user/i.test(msg)) {
      throw new Error('Este número não está no WhatsApp.');
    }
    if (msg) throw new Error(msg);
    throw e instanceof Error ? e : new Error('Falha ao enviar mensagem.');
  }
};

export const sendWhatsAppMedia = async (
  numberOrChatId: string,
  data: { mimeType: string; base64: string; filename?: string },
  caption?: string,
  options?: { sendAsDocument?: boolean }
) => {
  const { client } = getSingleton();
  const status = await startWhatsApp();
  if (status.status !== 'ready') {
    throw new Error('WhatsApp não está conectado.');
  }

  const mimeType = String(data?.mimeType || '').trim();
  const base64 = String(data?.base64 || '').trim();
  const filename = String(data?.filename || '').trim() || undefined;

  if (!mimeType || !base64) {
    throw new Error('Mídia inválida.');
  }

  const chatId = await resolveWhatsAppChatId(client, numberOrChatId);
  await patchInjectedWWebJSIfNeeded();
  const media = new MessageMedia(mimeType, base64, filename);
  const captionText = (caption || '').toString().trim();
  const sendAsDocument = options?.sendAsDocument === true;

  try {
    await client.sendMessage(chatId, media, {
      sendSeen: false,
      caption: captionText || undefined,
      sendMediaAsDocument: sendAsDocument ? true : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/no lid for user/i.test(msg)) {
      throw new Error('Este número não está no WhatsApp.');
    }
    if (msg) throw new Error(msg);
    throw e instanceof Error ? e : new Error('Falha ao enviar mídia.');
  }
};

export const subscribeWhatsAppEvents = (listener: (event: WhatsAppEvent) => void) => {
  const { emitter } = getSingleton();
  emitter.on('event', listener);
  return () => emitter.off('event', listener);
};
