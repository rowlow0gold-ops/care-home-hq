<script setup lang="ts">
/**
 * /tablet — caregiver dashboard.
 *
 * What goes here, in priority order for an arriving shift worker:
 *   1) 출퇴근 punch card — single big button (clock in / out)
 *   2) 인수인계 확인 — count of unacked handover notes; tap → list
 *   3) 공지사항 — most-recent announcements
 *   4) 오늘 식단 — today's breakfast/lunch/dinner from meal_plans
 *
 * Everything is read in parallel via useAsyncData. The page polls clock
 * status every 60s so the elapsed-time chip stays fresh.
 */
import { Loader2, LogIn, LogOut as LogOutIcon, ClipboardCheck, Megaphone, Utensils, AlertTriangle, CheckCircle2, Clock } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "오늘 · 케어닥" });

const api    = useTabletApi();
const toast  = useToast();
const { me } = useTablet();

// ─── Clock status ─────────────────────────────────────────────────────────
interface ClockEvent { id: string; kind: "in" | "out"; happened_at: string; note: string | null }
interface ClockStatus { current: "in" | "out"; last_event: ClockEvent | null; today_in_at: string | null; today_out_at: string | null; today_minutes: number }
const { data: clock, refresh: refreshClock } = await useAsyncData("tablet-clock", () =>
  api.get<ClockStatus>("/v1/clock/status"),
);
let clockTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => { clockTimer = setInterval(refreshClock, 60_000); });
onBeforeUnmount(() => { if (clockTimer) clearInterval(clockTimer); });

const punching = ref(false);
async function punch() {
  if (punching.value) return;
  const action = clock.value?.current === "in" ? "out" : "in";
  if (!confirm(action === "in" ? "출근 기록을 저장하시겠습니까?" : "퇴근 기록을 저장하시겠습니까?")) return;
  punching.value = true;
  try {
    await api.post(`/v1/clock/${action}`, {});
    toast.success(action === "in" ? "출근 기록됨" : "퇴근 기록됨", "⏱️");
    await refreshClock();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "기록 실패", "오류");
  } finally {
    punching.value = false;
  }
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}
function fmtMinutes(m: number): string {
  if (m <= 0) return "0분";
  const h = Math.floor(m / 60); const r = m % 60;
  return h > 0 ? `${h}시간 ${r}분` : `${r}분`;
}

// ─── Unacked handovers ────────────────────────────────────────────────────
interface HandoverNote {
  id: string; posted_by_name: string; posted_by_role: string;
  resident_name: string | null; category: string; body: string;
  posted_at: string; acked_by_me: boolean;
}
interface HandoverPage { items: HandoverNote[]; total: number }
const { data: unacked } = await useAsyncData("tablet-unacked", () =>
  api.get<HandoverPage>("/v1/handovers", { unacked_only: true, page_size: 3 }),
);

// ─── Announcements ────────────────────────────────────────────────────────
interface Announcement { id: string; title: string; body: string; priority: string; posted_by_name: string; posted_at: string }
interface AnnouncementPage { items: Announcement[]; total: number }
const { data: ann } = await useAsyncData("tablet-ann", () =>
  api.get<AnnouncementPage>("/v1/announcements", { page_size: 3 }),
);

// ─── Today's meal ─────────────────────────────────────────────────────────
interface MealPlan { id: string; week_start: string; day_of_week: number; meal_type: string; menu: string; notes: string | null }
const today = new Date();
const dayIdx = (today.getDay() + 6) % 7; // 0=Mon..6=Sun (DB convention)
const weekStart = (() => {
  const d = new Date(today);
  d.setDate(d.getDate() - dayIdx);
  return d.toISOString().slice(0, 10);
})();
const { data: meals } = await useAsyncData("tablet-meals", () =>
  api.get<MealPlan[]>("/v1/meals/range", { start: weekStart, end: weekStart }),
);
const todaysMeals = computed(() => {
  const rows = meals.value ?? [];
  return rows.filter(m => m.day_of_week === dayIdx);
});
function mealLabel(type: string): string {
  return { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식" }[type] ?? type;
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-5 py-6 space-y-4">
    <!-- Greeting + date -->
    <div>
      <p class="text-sm text-muted-foreground">{{ today.toLocaleDateString("ko-KR", { dateStyle: "full" }) }}</p>
      <h1 class="text-2xl font-bold mt-1">{{ me?.name ?? "" }}님, 안녕하세요</h1>
    </div>

    <!-- 1) Clock punch card -->
    <div class="rounded-2xl border bg-card p-5">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-base font-semibold inline-flex items-center gap-1.5">
          <Clock class="h-4 w-4" /> 출퇴근
        </h2>
        <span class="text-xs text-muted-foreground tabular-nums">
          오늘 근무 {{ fmtMinutes(clock?.today_minutes ?? 0) }}
        </span>
      </div>
      <div class="grid grid-cols-2 gap-3 text-sm mb-4">
        <div class="rounded-xl border p-3">
          <div class="text-xs text-muted-foreground mb-1">출근 시각</div>
          <div class="font-semibold tabular-nums">{{ fmtTime(clock?.today_in_at ?? null) }}</div>
        </div>
        <div class="rounded-xl border p-3">
          <div class="text-xs text-muted-foreground mb-1">퇴근 시각</div>
          <div class="font-semibold tabular-nums">{{ fmtTime(clock?.today_out_at ?? null) }}</div>
        </div>
      </div>
      <button
        type="button"
        class="w-full h-14 rounded-xl text-base font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-60"
        :class="clock?.current === 'in'
          ? 'bg-rose-500 text-white hover:bg-rose-600'
          : 'bg-emerald-500 text-white hover:bg-emerald-600'"
        :disabled="punching"
        @click="punch"
      >
        <Loader2 v-if="punching" class="h-5 w-5 animate-spin" />
        <LogOutIcon v-else-if="clock?.current === 'in'" class="h-5 w-5" />
        <LogIn v-else class="h-5 w-5" />
        {{ clock?.current === "in" ? "퇴근 기록" : "출근 기록" }}
      </button>
    </div>

    <!-- 2) Unacked handovers -->
    <div class="rounded-2xl border bg-card p-5">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-base font-semibold inline-flex items-center gap-1.5">
          <ClipboardCheck class="h-4 w-4" /> 인수인계 확인
        </h2>
        <NuxtLink to="/tablet/handover" class="text-xs text-primary font-medium">전체 보기 →</NuxtLink>
      </div>
      <div v-if="(unacked?.items?.length ?? 0) === 0" class="text-sm text-muted-foreground inline-flex items-center gap-1.5">
        <CheckCircle2 class="h-4 w-4 text-emerald-500" />
        확인할 인수인계가 없습니다.
      </div>
      <ul v-else class="space-y-2">
        <li v-for="h in unacked!.items" :key="h.id">
          <NuxtLink :to="`/tablet/handover#${h.id}`" class="block rounded-lg border bg-background hover:bg-muted/30 p-3">
            <div class="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
              <AlertTriangle v-if="h.category === 'urgent' || h.category === 'incident'" class="h-3.5 w-3.5 text-rose-500" />
              <span class="font-semibold text-foreground">{{ h.posted_by_name }}</span>
              <span v-if="h.resident_name">· {{ h.resident_name }} 어르신</span>
              <span class="ml-auto">{{ new Date(h.posted_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) }}</span>
            </div>
            <p class="text-sm line-clamp-2">{{ h.body }}</p>
          </NuxtLink>
        </li>
      </ul>
    </div>

    <!-- 3) Announcements -->
    <div class="rounded-2xl border bg-card p-5">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-base font-semibold inline-flex items-center gap-1.5">
          <Megaphone class="h-4 w-4" /> 공지사항
        </h2>
      </div>
      <div v-if="(ann?.items?.length ?? 0) === 0" class="text-sm text-muted-foreground">
        공지사항이 없습니다.
      </div>
      <ul v-else class="space-y-2">
        <li v-for="a in ann!.items" :key="a.id" class="rounded-lg border bg-background p-3">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-sm font-semibold">{{ a.title }}</span>
            <span
              class="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
              :class="a.priority === 'important'
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200'
                : a.priority === 'event'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'"
            >{{ a.priority === 'important' ? '중요' : a.priority === 'event' ? '행사' : '안내' }}</span>
          </div>
          <p class="text-sm whitespace-pre-line line-clamp-3">{{ a.body }}</p>
          <div class="text-[11px] text-muted-foreground mt-1.5">
            {{ a.posted_by_name }} · {{ new Date(a.posted_at).toLocaleDateString("ko-KR") }}
          </div>
        </li>
      </ul>
    </div>

    <!-- 4) Today's meal -->
    <div class="rounded-2xl border bg-card p-5">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-base font-semibold inline-flex items-center gap-1.5">
          <Utensils class="h-4 w-4" /> 오늘 식단
        </h2>
      </div>
      <div v-if="todaysMeals.length === 0" class="text-sm text-muted-foreground">
        오늘 등록된 식단이 없습니다.
      </div>
      <ul v-else class="space-y-2">
        <li v-for="m in todaysMeals" :key="m.id" class="rounded-lg border bg-background p-3 flex items-start gap-3">
          <span class="px-2 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary shrink-0">{{ mealLabel(m.meal_type) }}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm whitespace-pre-line">{{ m.menu }}</p>
            <p v-if="m.notes" class="text-xs text-muted-foreground mt-0.5">{{ m.notes }}</p>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
