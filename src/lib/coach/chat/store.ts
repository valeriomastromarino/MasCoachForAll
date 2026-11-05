// What the chat keeps on this device: what the athlete asked for today, and the conversation.
import type { Proposal } from "@/lib/training/suggest";
import { isCompact } from "@/lib/compact";
import { type ChatState, emptyState, type TodayOverrides } from "./context";

const TODAY_KEY = "mascoach-today";
const CHAT_KEY = "mascoach-chat";
export const OVERRIDES_EVENT = "mascoach-today";
const MAX_MESSAGES = 60;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the chat works, it just forgets.
  }
}

export const overridesSnapshot = (): string => read(TODAY_KEY) ?? "";

/** Today's wishes: anything saved on another day is gone (a tired night doesn't last). */
export function parseOverrides(raw: string, today: string): TodayOverrides {
  try {
    const o = JSON.parse(raw) as TodayOverrides;
    return o && o.date === today ? o : { date: today };
  } catch {
    return { date: today };
  }
}
export const loadOverrides = (today: string): TodayOverrides => parseOverrides(overridesSnapshot(), today);

export function saveOverrides(o: TodayOverrides) {
  write(TODAY_KEY, JSON.stringify(o));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OVERRIDES_EVENT));
}

export type ChatMessage = {
  id: string;
  role: "user" | "coach";
  text: string;
  lines?: string[];
  proposal?: Proposal;
  chips?: string[];
  at: string;
};

export type SavedChat = { messages: ChatMessage[]; state: ChatState };

/** Phone app: the thread lives in memory only, so closing and reopening the app starts a clean chat (it stays while moving between tabs). */
let memory: SavedChat | null = null;

export function loadChat(): SavedChat {
  if (isCompact()) {
    write(CHAT_KEY, null);
    return memory ?? { messages: [], state: emptyState() };
  }
  try {
    const raw = read(CHAT_KEY);
    if (!raw) return { messages: [], state: emptyState() };
    const parsed = JSON.parse(raw) as SavedChat;
    return { messages: Array.isArray(parsed.messages) ? parsed.messages : [], state: { ...emptyState(), ...parsed.state, pending: null, awaiting: null } };
  } catch {
    return { messages: [], state: emptyState() };
  }
}

export function saveChat(messages: ChatMessage[], state: ChatState) {
  if (isCompact()) {
    memory = { messages: messages.slice(-MAX_MESSAGES), state };
    return;
  }
  write(CHAT_KEY, JSON.stringify({ messages: messages.slice(-MAX_MESSAGES), state }));
}

export const clearChat = () => {
  memory = null;
  write(CHAT_KEY, null);
};
