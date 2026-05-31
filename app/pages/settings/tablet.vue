<script setup lang="ts">
/**
 * /settings/tablet — branch-manager (and HQ) controls for tablet rollout.
 *
 * Two cards:
 *  1) 페어 코드 발급 — generate an 8-char single-use code (valid 15 min).
 *     The branch manager shows this to the caregiver on the tablet.
 *  2) PIN 설정 — pick a caregiver from this branch, set/reset their 4-8
 *     digit PIN. PIN is the credential for tablet login.
 *
 * Both endpoints already exist on the backend:
 *   POST /v1/devices/pair-code   (Body: { label })
 *   POST /v1/auth/pin/set        (Body: { user_id, pin })
 */
import { Loader2, Tablet, KeyRound, Copy, Search, RefreshCw, CheckCircle2 } from "@lucide/vue";

useHead({ title: "태블릿 관리 · 케어닥 HQ" });
definePageMeta({ middleware: ["auth"] }); // (no-op, auth.global already runs)

const api    = useApi();
const toast  = useToast();
const { me } = useAuth();

const isAllowed = computed(() => {
  const role = me.value?.role;
  return role === "branch_manager" || role === "hq" || role === "super_admin";
});

// ─── 1) Pair code generator ─────────────────────────────────────────────
const label = ref("");
const generating = ref(false);
const currentCode = ref<{ code: string; expires_at: string; label: string } | null>(null);
const expiresIn = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

async function generate() {
  if (generating.value) return;
  if (!label.value.trim()) {
    toast.error("태블릿 이름(라벨)을 입력해주세요", "오류");
    return;
  }
  generating.value = true;
  try {
    const res = await api.post<{ code: string; expires_at: string; label: string }>(
      "/v1/devices/pair-code",
      { label: label.value.trim() },
    );
    currentCode.value = res;
    label.value = "";
    startCountdown(res.expires_at);
    toast.success(`코드 ${res.code} (15분간 유효)`, "📋 페어 코드 발급");
  } catch (e: any) {
    toast.error(e?.data?.message ?? "코드 발급 실패", "오류");
  } finally {
    generating.value = false;
  }
}

function startCountdown(iso: string) {
  if (countdownTimer) clearInterval(countdownTimer);
  const expiry = new Date(iso).getTime();
  const update = () => {
    const ms = expiry - Date.now();
    expiresIn.value = Math.max(0, Math.floor(ms / 1000));
    if (expiresIn.value === 0 && countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  };
  update();
  countdownTimer = setInterval(update, 1000);
}
onBeforeUnmount(() => { if (countdownTimer) clearInterval(countdownTimer); });

const expiryLabel = computed(() => {
  const s = expiresIn.value;
  if (s <= 0) return "만료됨";
  return `${Math.floor(s / 60)}분 ${s % 60}초 남음`;
});

function copyCode() {
  if (!currentCode.value) return;
  navigator.clipboard.writeText(currentCode.value.code);
  toast.success("코드가 복사되었습니다", currentCode.value.code);
}

// ─── 2) PIN setter ──────────────────────────────────────────────────────
interface OrgPerson {
  id: string; full_name: string; email: string;
  role: string; position_ko: string; branch_id: string | null;
}
interface PagedOrg { items: OrgPerson[]; total: number; page: number; page_size: number }

const q = ref("");
const appliedQ = ref("");
const page = ref(1);
const pageSize = ref(25);
function applySearch() { appliedQ.value = q.value.trim(); page.value = 1; }

const { data: paged, refresh: refreshStaff } = await useAsyncData(
  () => `tablet-admin-staff-${appliedQ.value}-${page.value}-${pageSize.value}`,
  () => api.get<PagedOrg>("/v1/org/paged", {
    q: appliedQ.value || undefined,
    page: page.value,
    page_size: pageSize.value,
    // BM is automatically scoped to their own branch on the backend.
    // HQ sees everyone.
    employment_type: undefined,
  }),
  { watch: [appliedQ, page, pageSize], default: () => ({ items: [], total: 0, page: 1, page_size: 25 }) },
);
const total = computed(() => paged.value?.total ?? 0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

// PIN modal
const pinTarget = ref<OrgPerson | null>(null);
const pinValue  = ref("");
const settingPin = ref(false);
function openPin(p: OrgPerson) { pinTarget.value = p; pinValue.value = ""; }
function closePin() { pinTarget.value = null; pinValue.value = ""; }

async function savePin() {
  if (!pinTarget.value) return;
  if (!/^\d{4,8}$/.test(pinValue.value)) {
    toast.error("PIN은 4-8자리 숫자입니다", "오류");
    return;
  }
  settingPin.value = true;
  try {
    await api.post("/v1/auth/pin/set", {
      user_id: pinTarget.value.id,
      pin:     pinValue.value,
    });
    toast.success(`${pinTarget.value.full_name} PIN 설정 완료`, "✅");
    closePin();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "PIN 설정 실패", "오류");
  } finally {
    settingPin.value = false;
  }
}

// Caregivers + nurses only — the only roles allowed on the tablet.
const eligible = computed(() =>
  (paged.value?.items ?? []).filter(p => p.role === "caregiver" || p.role === "nurse"),
);
</script>

<template>
  <div class="px-8 py-6 max-w-5xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight">태블릿 관리</h1>
      <p class="text-sm text-muted-foreground mt-1">
        요양보호사가 태블릿에서 PIN 으로 로그인할 수 있도록 페어 코드 발급 + PIN 설정을 합니다.
      </p>
    </header>

    <div v-if="!isAllowed" class="rounded-xl border bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 p-4 text-sm">
      이 페이지는 센터장 또는 본부 사용자만 접근할 수 있습니다.
    </div>

    <template v-else>
      <!-- Pair code generator -->
      <div class="rounded-xl border bg-card overflow-hidden mb-5">
        <div class="px-6 py-4 border-b flex items-center gap-2">
          <Tablet class="h-4 w-4 text-primary" />
          <h2 class="font-semibold">1. 태블릿 페어 코드 발급</h2>
        </div>
        <div class="p-6 space-y-4">
          <p class="text-sm text-muted-foreground">
            새 태블릿을 등록할 때 사용합니다. 8자리 코드는 <b>15분간 유효</b>하며 한 번 사용하면 만료됩니다.
            태블릿에서 <a href="/tablet/pair" target="_blank" rel="noopener" class="text-primary underline">/tablet/pair</a> 에 접속한 뒤 이 코드를 입력하면 등록됩니다.
          </p>
          <div class="flex gap-2 items-end flex-wrap">
            <div class="flex-1 min-w-[240px]">
              <label class="text-xs font-semibold block mb-1">태블릿 이름 (라벨)</label>
              <input
                v-model="label"
                type="text"
                class="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:border-primary"
                placeholder="예: 강남센터 1층 김간호사 iPad"
                :disabled="generating"
              />
            </div>
            <button
              type="button"
              class="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
              :disabled="generating || !label.trim()"
              @click="generate"
            >
              <Loader2 v-if="generating" class="h-4 w-4 animate-spin" />
              <KeyRound v-else class="h-4 w-4" />
              코드 발급
            </button>
          </div>

          <div v-if="currentCode" class="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
            <div class="text-xs text-muted-foreground mb-1">현재 페어 코드 · {{ currentCode.label }}</div>
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div class="font-mono text-4xl font-bold tracking-widest">{{ currentCode.code }}</div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-muted-foreground tabular-nums">{{ expiryLabel }}</span>
                <button
                  type="button"
                  class="h-9 px-3 rounded-md border border-input bg-background text-sm inline-flex items-center gap-1.5 hover:bg-muted"
                  @click="copyCode"
                >
                  <Copy class="h-3.5 w-3.5" />
                  복사
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- PIN setter -->
      <div class="rounded-xl border bg-card overflow-hidden">
        <div class="px-6 py-4 border-b flex items-center gap-2">
          <KeyRound class="h-4 w-4 text-primary" />
          <h2 class="font-semibold">2. PIN 설정</h2>
        </div>
        <div class="p-6">
          <p class="text-sm text-muted-foreground mb-4">
            요양보호사 · 간호사만 태블릿 PIN 로그인을 사용합니다. PIN은 4-8자리 숫자이며 언제든 재설정할 수 있습니다.
          </p>

          <div class="flex gap-2 items-center mb-3">
            <div class="relative flex-1 max-w-sm">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                v-model="q"
                type="text"
                class="w-full h-10 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:border-primary"
                placeholder="이름 또는 이메일 검색"
                @keyup.enter="applySearch"
              />
            </div>
            <button type="button" class="h-10 w-10 rounded-md bg-primary text-primary-foreground inline-flex items-center justify-center" @click="applySearch">
              <Search class="h-4 w-4" />
            </button>
            <span class="ml-auto text-xs text-muted-foreground">{{ eligible.length }}명 표시 / 총 {{ total }}명</span>
          </div>

          <div class="rounded-lg border overflow-hidden">
            <div v-if="eligible.length === 0" class="py-10 text-center text-sm text-muted-foreground">
              조건에 맞는 요양보호사 / 간호사가 없습니다.
            </div>
            <ul v-else class="divide-y">
              <li v-for="p in eligible" :key="p.id" class="px-4 py-3 flex items-center gap-3 hover:bg-muted/30">
                <div class="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                  {{ p.full_name.charAt(0) }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">{{ p.full_name }}</div>
                  <div class="text-xs text-muted-foreground truncate">{{ p.email }} · {{ p.position_ko }}</div>
                </div>
                <button
                  type="button"
                  class="h-9 px-3 rounded-md border border-input bg-background text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted"
                  @click="openPin(p)"
                >
                  <KeyRound class="h-3.5 w-3.5" />
                  PIN 설정
                </button>
              </li>
            </ul>
          </div>

          <div class="flex items-center justify-between mt-3 text-xs">
            <div class="text-muted-foreground">페이지 {{ page }} / {{ totalPages }}</div>
            <div class="flex items-center gap-1.5">
              <button class="h-8 px-2 rounded border" :disabled="page <= 1" @click="page--">이전</button>
              <button class="h-8 px-2 rounded border" :disabled="page >= totalPages" @click="page++">다음</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- PIN modal -->
    <Teleport to="body">
      <div
        v-if="pinTarget"
        class="fixed inset-0 z-[140] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
        @click.self="closePin"
      >
        <div class="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6">
          <h3 class="text-base font-semibold mb-1">PIN 설정</h3>
          <p class="text-sm text-muted-foreground mb-4">
            <b>{{ pinTarget.full_name }}</b> 님의 태블릿 로그인 PIN을 설정합니다.
          </p>
          <input
            v-model="pinValue"
            type="text"
            inputmode="numeric"
            maxlength="8"
            class="w-full h-14 px-4 rounded-lg border border-input bg-background text-2xl font-mono tracking-widest text-center focus:outline-none focus:border-primary"
            placeholder="4-8자리 숫자"
            :disabled="settingPin"
            @input="pinValue = pinValue.replace(/\D/g, '')"
          />
          <div class="flex gap-2 mt-5">
            <button
              type="button"
              class="flex-1 h-10 rounded-md border border-input bg-background text-sm hover:bg-muted"
              :disabled="settingPin"
              @click="closePin"
            >
              취소
            </button>
            <button
              type="button"
              class="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
              :disabled="settingPin || pinValue.length < 4"
              @click="savePin"
            >
              <Loader2 v-if="settingPin" class="h-4 w-4 animate-spin" />
              <CheckCircle2 v-else class="h-4 w-4" />
              저장
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
