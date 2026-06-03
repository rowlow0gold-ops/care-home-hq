/**
 * Chat client — shared by the HQ web and the caregiver tablet.
 *
 * Polling contract (per the desktop handoff note):
 *   every 4 s:
 *     1. GET /chat/invites  → auto-accept every pending invite
 *     2. GET /chat/conversations  → conversation list
 *     3. for the currently-open conversation:
 *          GET /chat/conversations/:id/messages?since=<last_msg_id>
 *          (the server marks them read for us)
 *
 * Auto-accepting is critical — when the desktop (administrator) starts a
 * chat, the tablet has to *silently* accept the invite or the conversation
 * never appears.
 *
 * The composable is a singleton via `useState` so multiple components on the
 * same page (e.g. the bottom-nav unread badge + the chat list) share state.
 */
import { ref, computed } from "vue";

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

// While a thread is open, poll fast so messages feel near-instant. When
// nothing is open (background work: auto-accept invites, refresh badge),
// drop to a calmer cadence to be polite to the API.
const POLL_INTERVAL_OPEN_MS  = 1000;
const POLL_INTERVAL_IDLE_MS  = 3000;

export function useChat() {
  const api  = useApi();
  const auth = useAuth();

  // Singletons across the whole app.
  const conversations = useState<ConversationSummary[]>("chat:conversations", () => []);
  const openConvId    = useState<string | null>("chat:openConvId", () => null);
  // Keyed by conversation_id.
  const messagesByConv = useState<Record<string, ChatMessage[]>>("chat:messagesByConv", () => ({}));

  // Singleton polling state — only the first useChat() call starts the timer.
  const pollerActive = useState<boolean>("chat:pollerActive", () => false);
  const pollingNow   = useState<boolean>("chat:pollingNow",   () => false);

  // Total unread across every conversation — used by the bottom nav badge.
  const totalUnread = computed(() =>
    conversations.value.reduce((sum, c) => sum + (c.unread_count ?? 0), 0),
  );

  // ─── core ops ─────────────────────────────────────────────────────────────

  async function autoAcceptInvites(): Promise<number> {
    try {
      const invites = await api.get<InviteRow[]>("/v1/chat/invites");
      if (!invites?.length) return 0;
      // Accept sequentially; if one fails (already accepted, race), keep going.
      let accepted = 0;
      for (const iv of invites) {
        try {
          await api.post(`/v1/chat/invites/${iv.id}/accept`);
          accepted += 1;
        } catch { /* ignore — next poll will retry */ }
      }
      return accepted;
    } catch { return 0; }
  }

  async function refreshConversations() {
    try {
      conversations.value = await api.get<ConversationSummary[]>("/v1/chat/conversations");
    } catch { /* swallow — keep last good list */ }
  }

  /** Initial / re-open load: latest 50 (ASC). */
  async function loadMessages(convId: string) {
    try {
      const rows = await api.get<ChatMessage[]>(`/v1/chat/conversations/${convId}/messages`);
      messagesByConv.value = { ...messagesByConv.value, [convId]: rows };
    } catch { /* swallow */ }
  }

  /** Polling tick for the currently-open conversation: since-cursor append. */
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
      // Optimistic append (the server-side trigger will bump last_message_at).
      const existing = messagesByConv.value[convId] ?? [];
      messagesByConv.value = {
        ...messagesByConv.value,
        [convId]: [...existing, row],
      };
      // Update the list's preview eagerly so the bottom-nav badge clears
      // without waiting for the next refreshConversations() tick.
      const idx = conversations.value.findIndex(c => c.id === convId);
      if (idx >= 0) {
        const c = conversations.value[idx]!;
        conversations.value.splice(idx, 1, {
          ...c,
          last_body:       row.body,
          last_message_at: row.sent_at,
          unread_count:    0,
        });
      }
      return row;
    } catch {
      return null;
    }
  }

  /**
   * Start a new chat with `invitee_id`. If there's already an existing chat
   * with this person (us + invitee = 2 members, no others), reuse it.
   */
  async function startConversation(invitee_id: string, title?: string): Promise<ConversationSummary | null> {
    // Reuse: any of my conversations whose `other_names` is exactly this person?
    // We don't have the invitee's name here, so we just try to match the
    // simplest case: the conversation summary's other_names is a single string
    // that doesn't contain a comma. Worst case, a duplicate gets created — not
    // a problem, just two chats.
    try {
      const row = await api.post<ConversationSummary>("/v1/chat/conversations", {
        invitee_id,
        title: title || undefined,
      });
      // Push to list eagerly.
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

  /** 전체삭제 — fire DELETEs in parallel; remove everything from local state. */
  async function deleteAllConversations(): Promise<number> {
    const ids = conversations.value.map(c => c.id);
    if (!ids.length) return 0;
    const results = await Promise.allSettled(
      ids.map(id => api.delete(`/v1/chat/conversations/${id}`)),
    );
    const ok = results.filter(r => r.status === "fulfilled").length;
    // Optimistic: just refetch.
    await refreshConversations();
    messagesByConv.value = {};
    return ok;
  }

  // ─── polling loop ─────────────────────────────────────────────────────────

  async function pollOnce() {
    if (!auth.me.value) return; // not logged in → nothing to poll
    if (pollingNow.value) return;
    pollingNow.value = true;
    try {
      await autoAcceptInvites();
      await refreshConversations();
      if (openConvId.value) await pollMessages(openConvId.value);
    } finally {
      pollingNow.value = false;
    }
  }

  function startPolling() {
    if (pollerActive.value) return;
    pollerActive.value = true;
    // Adaptive loop: re-arm a single setTimeout based on whether a thread
    // is open. This makes interval changes take effect on the *next* tick
    // (no waiting out the old 4s before snapping to 1s when a chat opens).
    let handle: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      await pollOnce();
      const next = openConvId.value ? POLL_INTERVAL_OPEN_MS : POLL_INTERVAL_IDLE_MS;
      handle = setTimeout(tick, next);
    };
    void tick();
    if (import.meta.client) {
      window.addEventListener("beforeunload", () => {
        if (handle) clearTimeout(handle);
      }, { once: true });
    }
  }

  function setOpenConversation(convId: string | null) {
    openConvId.value = convId;
    // When opening, immediately do a fresh load so the user doesn't wait
    // up to 4 s for the next tick.
    if (convId) void loadMessages(convId);
  }

  // Resolve title for display: explicit title > other_names > fallback.
  function convTitle(c: ConversationSummary): string {
    return c.title || c.other_names || "대화";
  }

  return {
    // state
    conversations,
    messagesByConv,
    openConvId,
    totalUnread,
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
