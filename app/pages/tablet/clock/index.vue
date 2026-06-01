<script setup lang="ts">
/**
 * /tablet/clock — full clock-in/out history for the current worker.
 * Dashboard already has the punch button; this page is the receipt view.
 */
import { LogIn, LogOut as LogOutIcon, Loader2 } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "출퇴근 기록 · 케어닥" });

const api    = useTabletApi();
const toast  = useToast();

interface ClockEvent { id: string; kind: "in" | "out"; happened_at: string; note: string | null }
interface ClockPage { items: ClockEvent[]; total: number }

const { data: paged, pending, refresh } = await useAsyncData("tablet-clock-history", () =>
  api.get<ClockPage>("/v1/clock/me", { page: 1, page_size: 100 }),
);

interface ClockStatus { current: "in" | "out"; today_in_at: string | null; today_out_at: string | null; today_minutes: number }
const { data: status, refresh: refreshStatus } = await useAsyncData("tablet-clock-status-2", () =>
  api.get<ClockStatus>("/v1/clock/status"),
);

const punching = ref(false);
async function punch() {
  if (punching.value) return;
  const action = status.value?.current === "in" ? "out" : "in";
  if (!confirm(action === "in" ? "출근 기록을 저장하시겠습니까?" : "퇴근 기록을 저장하시겠습니까?")) return;
  punching.value = true;
  try {
    await api.post(`/v1/clock/${action}`, {});
    toast.success(action === "in" ? "출근 기록됨" : "퇴근 기록됨", "⏱️");
    await Promise.all([refresh(), refreshStatus()]);
  } catch (e: any) {
    toast.error(e?.data?.message ?? "기록 실패", "오류");
  } finally {
    punching.value = false;
  }
}

function fmtMinutes(m: number): string {
  if (m <= 0) return "0분";
  const h = Math.floor(m / 60); const r = m % 60;
  return h > 0 ? `${h}시간 ${r}분` : `${r}분`;
}

// Group history by day for readability.
interface Group { date: string; label: string; items: ClockEvent[] }
const groups = computed<Group[]>(() => {
  const out: Map<string, Group> = new Map();
  for (const e of paged.value?.items ?? []) {
    const d = new Date(e.happened_at);
    const key = d.toISOString().slice(0, 10);
    if (!out.has(key)) {
      out.set(key, {
        date: key,
        label: d.toLocaleDateString("ko-KR", { dateStyle: "full" }),
        items: [],
      });
    }
    out.get(key)!.items.push(e);
  }
  return Array.from(out.values());
});
</script>

<template>
  <div class="max-w-2xl mx-auto px-5 py-6">
    <h1 class="text-2xl font-bold mb-4">출퇴근 기록</h1>

    <!-- Punch card -->
    <div class="rounded-2xl border bg-card p-5 mb-5">
      <div class="grid grid-cols-2 gap-3 text-sm mb-4">
        <div class="rounded-xl border p-3">
          <div class="text-xs text-muted-foreground mb-1">오늘 출근</div>
          <div class="font-semibold tabular-nums">
            {{ status?.today_in_at ? new Date(status.today_in_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "—" }}
          </div>
        </div>
        <div class="rounded-xl border p-3">
          <div class="text-xs text-muted-foreground mb-1">오늘 퇴근</div>
          <div class="font-semibold tabular-nums">
            {{ status?.today_out_at ? new Date(status.today_out_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "—" }}
          </div>
        </div>
      </div>
      <div class="text-center text-xs text-muted-foreground mb-3">근무 {{ fmtMinutes(status?.today_minutes ?? 0) }}</div>
      <button
        type="button"
        class="w-full h-14 rounded-xl text-base font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
        :class="status?.current === 'in'
          ? 'bg-rose-500 text-white hover:bg-rose-600'
          : 'bg-emerald-500 text-white hover:bg-emerald-600'"
        :disabled="punching"
        @click="punch"
      >
        <Loader2 v-if="punching" class="h-5 w-5 animate-spin" />
        <LogOutIcon v-else-if="status?.current === 'in'" class="h-5 w-5" />
        <LogIn v-else class="h-5 w-5" />
        {{ status?.current === "in" ? "퇴근 기록" : "출근 기록" }}
      </button>
    </div>

    <!-- History -->
    <h2 class="text-sm font-semibold text-muted-foreground mb-2">최근 기록</h2>
    <div v-if="pending" class="py-8 text-center text-muted-foreground">불러오는 중…</div>
    <div v-else-if="groups.length === 0" class="py-12 text-center text-sm text-muted-foreground">
      아직 기록이 없습니다.
    </div>
    <div v-else class="space-y-4">
      <section v-for="g in groups" :key="g.date">
        <div class="text-xs font-medium text-muted-foreground mb-2">{{ g.label }}</div>
        <ul class="space-y-1.5">
          <li
            v-for="e in g.items" :key="e.id"
            class="flex items-center gap-3 rounded-lg border bg-card p-3"
          >
            <span
              class="h-9 w-9 rounded-lg flex items-center justify-center text-white shrink-0"
              :class="e.kind === 'in' ? 'bg-emerald-500' : 'bg-rose-500'"
            >
              <LogIn v-if="e.kind === 'in'" class="h-4 w-4" />
              <LogOutIcon v-else class="h-4 w-4" />
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold">
                {{ e.kind === "in" ? "출근" : "퇴근" }}
              </div>
              <div v-if="e.note" class="text-xs text-muted-foreground truncate">{{ e.note }}</div>
            </div>
            <div class="text-sm tabular-nums text-muted-foreground shrink-0">
              {{ new Date(e.happened_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) }}
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
