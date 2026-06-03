/**
 * Chat client — shared by HQ web and the caregiver tablet.
 *
 * Polling: a single setTimeout chain ticks at 1.5 s (idle) / 1 s (thread open).
 * Each tick: auto-accepts pending invites → refreshes conversation list →
 * if a thread is open, since-cursor appends new messages.
 *
 * Resilience:
 *   - pollOnce never throws (every fetch is try/caught individually + the
 *     whole body is wrapped in another try/catch in the tick), so the chain
 *     never dies.
 *   - On document `visibilitychange` (tab refocused) and `online`, we fire a
 *     poll immediately instead of waiting out the timer — this fixes the
 *     "I had to refresh to see the new message" symptom when the browser
 *     throttled the timer in a background tab.
 *
 * Singleton via `useState` so the bottom-nav badge + the chat page share state.
 *
 * Also exports a 한글 초성 + ranked search helper (`matchScore`) ported from
 * the Tauri desktop's chat search.
 */
import { computed } from "vue";

export interface ConversationSummary {
  id:                string;
  branch_id:         string | null;
  title:             string | null;
  created_by:        string;
  created_at:        string;
  last_message_at:   string;
  other_names:       string | null;
  last_body:         string | null;
  unread_count:      number;
}

export interface ChatMessage {
  id:               string;
  conversation_id:  string;
  sender_id:        string;
  sender_name:      string;
  body:             string;
  sent_at:          string;
}

export interface InviteRow {
  id:                  string;
  conversation_id:     string;
  conversation_title:  string | null;
  invited_by:          string;
  invited_by_name:     string;
  requested_at:        string;
}

export interface ChatContact {
  id:          string;
  full_name:   string;
  role:        string;
  position:    string;
  branch_id:   string | null;
  branch_name: string | null;
}

// ─── 한글 초성 검색 ────────────────────────────────────────────────────────
const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
export function toChosung(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code >= 0xac00 && code <= 0xd7a3 ? CHO[Math.floor((code - 0xac00) / 588)] : s[i];
  }
  return out;
}
/** Ranked score: 0 = no match. Higher = more relevant. */
export function matchScore(name: string, position: string, q: string): number {
  const n = name.toLowerCase();
  const c = toChosung(name);
  const p = (position || "").toLowerCase();
  if (n === q)              return 100;
  if (n.startsWith(q))      return 85;
  if (c.startsWith(q))      return 75;
  if (n.includes(q))        return 65;
  if (c.includes(q))        return 55;
  if (p.startsWith(q))      return 40;
  if (p.includes(q))        return 30;
  return 0;
}

const POLL_INTERVAL_OPEN_MS = 1000;
const POLL_INTERVAL_IDLE_MS = 1500;

export function useChat() {
  const api  = useApi();
  const auth = useAuth();

  const conversations  = useState<ConversationSummary[]>("chat:conversations", () => []);
  const openConvId     = useState<string | null>("chat:openConvId", () => null);
  const messagesByConv = useState<Record<string, ChatMessage[]>>("chat:messagesByConv", () => ({}));

  const pollerActive = useState<boolean>("chat:pollerActive", () => false);
  const pollingNow   = useState<boolean>("chat:pollingNow",   () => false);
  // Bumped by every poll that mutates state; lets components watch it as a
  // cheap "something changed" signal when a more specific watch is awkward.
  const pollTick     = useState<number>("chat:pollTick", () => 0);

  const totalUnread = computed(() =>
    conversations.value.reduce((sum, c) => sum + (c.unread_count ?? 0), 0),
  );

  // ─── core ops (each one swallows its own errors) ────────────────────────

  async function autoAcceptInvites(): Promise<number> {
    try {
      const invites = await api.get<InviteRow[]>("/v1/chat/invites");
      if (!invites?.length) return 0;
      let accepted = 0;
      for (const iv of invites) {
        try { await api.post(`/v1/chat/invites/${iv.id}/accept`); accepted += 1; }
        catch { /* next poll will retry */ }
      }
      return accepted;
    } catch { return 0; }
  }

  async function refreshConversations() {
    try {
      conversations.value = await api.get<ConversationSummary[]>("/v1/chat/conversations");
    } catch { /* keep last good */ }
  }

  async function loadMessages(convId: string) {
    try {
      const rows = await api.get<ChatMessage[]>(`/v1/chat/conversations/${convId}/messages`);
      messagesByConv.value = { ...messagesByConv.value, [convId]: rows };
    } catch { /* swallow */ }
  }

  async function pollMessages(convId: string) {
    const existing = messagesByConv.value[convId] ?? [];
    const lastId   = existing.length ? existing[existing.length - 1]!.id : undefined;
    try {
      const fresh = await api.get<ChatMessage[]>(
        `/v1/chat/conversations/${convId}/messages`,
        lastId ? { since: lastId } : undefined,
      );
      if (!fresh?.length) return;
      messagesByConv.value = {
        ...messagesByConv.value,
        [convId]: [...existing, ...fresh],
      };
    } catch { /* swallow */ }
  }

  async function sendMessage(convId: string, body: string): Promise<ChatMessage | null> {
    const trimmed = body.trim();
    if (!trimmed) return null;
    try {
      const row = await api.post<ChatMessage>(
        `/v1/chat/conversations/${convId}/messages`,
        { body: trimmed },
      );
      const existing = messagesByConv.value[convId] ?? [];
      messagesByConv.value = { ...messagesByConv.value, [convId]: [...existing, row] };
      const idx = conversations.value.findIndex(c => c.id === convId);
      if (idx >= 0) {
        const c = conversations.value[idx]!;
        conversations.value.splice(idx, 1, {
          ...c, last_body: row.body, last_message_at: row.sent_at, unread_count: 0,
        });
      }
      return row;
    } catch { return null; }
  }

  async function startConversation(invitee_id: string, title?: string): Promise<ConversationSummary | null> {
    try {
      const row = await api.post<ConversationSummary>("/v1/chat/conversations", {
        invitee_id, title: title || undefined,
      });
      conversations.value = [row, ...conversations.value.filter(c => c.id !== row.id)];
      return row;
    } catch { return null; }
  }

  async function deleteConversation(convId: string) {
    try {
      await api.delete(`/v1/chat/conversations/${convId}`);
      conversations.value = conversations.value.filter(c => c.id !== convId);
      const next = { ...messagesByConv.value };
      delete next[convId];
      messagesByConv.value = next;
    } catch { /* swallow */ }
  }

  async function deleteAllConversations(): Promise<number> {
    const ids = conversations.value.map(c => c.id);
    if (!ids.length) return 0;
    const r = await Promise.allSettled(ids.map(id => api.delete(`/v1/chat/conversations/${id}`)));
    const ok = r.filter(x => x.status === "fulfilled").length;
    await refreshConversations();
    messagesByConv.value = {};
    return ok;
  }

  // ─── polling loop ─────────────────────────────────────────────────────────

  async function pollOnce() {
    if (!auth.me.value)   return;
    if (pollingNow.value) return;
    pollingNow.value = true;
    try {
      await autoAcceptInvites();
      await refreshConversations();
      if (openConvId.value) await pollMessages(openConvId.value);
      pollTick.value += 1;
    } finally {
      pollingNow.value = false;
    }
  }

  function startPolling() {
    if (pollerActive.value) return;
    pollerActive.value = true;
    let handle: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      // Belt-and-braces: each individual op already try/catches, but the
      // outer try here means even a totally unexpected error can't kill the
      // chain.
      try { await pollOnce(); } catch { /* swallow */ }
      const next = openConvId.value ? POLL_INTERVAL_OPEN_MS : POLL_INTERVAL_IDLE_MS;
      handle = setTimeout(() => { void tick(); }, next);
    };
    void tick();

    if (import.meta.client) {
      // Browsers throttle setTimeout in background tabs (1+ minute). When
      // the tab becomes visible again, poll immediately — this is the most
      // common "I had to refresh to see the message" cause.
      const wakeUp = () => { if (document.visibilityState === "visible") void pollOnce(); };
      document.addEventListener("visibilitychange", wakeUp);
      window.addEventListener("focus",  wakeUp);
      window.addEventListener("online", wakeUp);
      window.addEventListener("beforeunload", () => {
        if (handle) clearTimeout(handle);
      }, { once: true });
    }
  }

  function setOpenConversation(convId: string | null) {
    openConvId.value = convId;
    if (convId) void loadMessages(convId);
  }

  function convTitle(c: ConversationSummary): string {
    return c.title || c.other_names || "대화";
  }

  return {
    // state
    conversations,
    messagesByConv,
    openConvId,
    totalUnread,
    pollTick,
    // actions
    startPolling,
    pollOnce,
    setOpenConversation,
    sendMessage,
    startConversation,
    deleteConversation,
    deleteAllConversations,
    refreshConversations,
    loadMessages,
    convTitle,
  };
}
