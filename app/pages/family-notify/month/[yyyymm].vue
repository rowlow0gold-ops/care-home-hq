<script setup lang="ts">
/**
 * /family-notify/month/[yyyymm] — read-only summary for a 정기 batch.
 *
 * Per business spec: 정기 sends ALL the month's photos with no curation.
 * This page is just a quick preview (who, how many photos) + a 발송 button.
 * No picker, no auto-select, no per-photo toggle.
 */
import {
  Send, Camera, Building2, Loader2, Search, ArrowLeft, AlertCircle,
  ChevronLeft, ChevronRight,
} from "@lucide/vue";

interface ResidentBatchRow {
  resident_id:     string;
  resident_name:   string;
  branch_id:       string;
  branch_name:     string;
  candidate_count: number;
  picked_count:    number;
  sent_count:      number;
  last_sent_month: string | null;
}
interface PickerPagedResponse {
  items:        ResidentBatchRow[];
  total:        number;
  total_picked: number;
  page:         number;
  page_size:    number;
}
interface Branch { id: string; name: string; branch_type: "hub" | "satellite" }

const route  = useRoute();
const router = useRouter();
const api    = useApi();
const toast  = useToast();

const month = route.params.yyyymm as string;
useHead({ title: () => `${month} 정기 발송 · 가족 알림` });

const branch = ref<string>("");
const has    = ref<string>("");
const q      = ref<string>("");
const appliedBranch = ref(branch.value);
const appliedHas    = ref(has.value);
const appliedQ      = ref(q.value);
const page     = ref(1);
const pageSize = ref(25);

function applyFilters() {
  appliedBranch.value = branch.value;
  appliedHas.value    = has.value;
  appliedQ.value      = q.value.trim();
  page.value = 1;
}
watch(pageSize, () => { page.value = 1; });

const { data: dashboard } = await useAsyncData("fam-branches-month", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

const { data: paged, pending, error, refresh } = await useAsyncData(
  () => `family-month-${month}-${appliedBranch.value}-${appliedHas.value}-${appliedQ.value}-${page.value}-${pageSize.value}`,
  () => api.get<PickerPagedResponse>("/v1/photos/picker/paged", {
    month,
    branch_id: appliedBranch.value || undefined,
    q:         appliedQ.value || undefined,
    status:    appliedHas.value || undefined,
    page:      page.value,
    page_size: pageSize.value,
  }),
  { watch: [appliedBranch, appliedHas, appliedQ, page, pageSize] },
);

const totalPages = computed(() =>
  Math.max(1, Math.ceil((paged.value?.total ?? 0) / pageSize.value)),
);
const showingFrom = computed(() =>
  paged.value && paged.value.total > 0 ? (page.value - 1) * pageSize.value + 1 : 0,
);
const showingTo = computed(() =>
  paged.value ? Math.min(page.value * pageSize.value, paged.value.total) : 0,
);

const sending = ref(false);
async function sendBatchNow() {
  if (sending.value) return;
  const n = paged.value?.total_picked ?? 0;
  if (n === 0) { toast.error("발송할 사진이 없습니다"); return; }
  if (!confirm(`${month} 모든 사진 ${n}건을 가족 Telegram으로 즉시 발송합니다.`)) return;
  sending.value = true;
  try {
    const r = await api.post<{ queued: number }>("/v1/photos/send-batch", {
      month, branch_id: appliedBranch.value || undefined,
    });
    toast.success(`${r.queued}건 발송 요청 완료`);
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "발송 실패", "오류");
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <NuxtLink
      to="/family-notify"
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
    >
      <ArrowLeft class="h-4 w-4" />
      스케쥴러
    </NuxtLink>

    <header class="mb-6 flex items-center justify-between gap-4 flex-wrap">
      <h1 class="text-2xl font-bold tracking-tight">{{ month }} 정기 발송</h1>
      <button
        type="button"
        class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
        :disabled="sending || (paged?.total_picked ?? 0) === 0"
        @click="sendBatchNow"
      >
        <Loader2 v-if="sending" class="h-4 w-4 animate-spin" />
        <Send v-else class="h-4 w-4" />
        발송 ({{ paged?.total_picked ?? 0 }}건)
      </button>
    </header>

    <div class="rounded-xl border bg-card overflow-hidden">
      <!-- Filter bar (search + branch only — no picker tools) -->
      <div class="px-6 py-3 border-b flex flex-wrap items-center gap-2 bg-muted/10">
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            v-model="q"
            placeholder="어르신 이름 또는 지점 검색"
            class="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            @keyup.enter="applyFilters"
          >
        </div>
        <select v-model="branch" class="h-10 w-48 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15">
          <option value="">전체 지점</option>
          <optgroup label="광역센터 (Hub)">
            <option v-for="b in (dashboard?.branches ?? []).filter((x) => x.branch_type === 'hub')" :key="b.id" :value="b.id">{{ b.name }}</option>
          </optgroup>
          <optgroup label="위성센터 (Satellite)">
            <option v-for="b in (dashboard?.branches ?? []).filter((x) => x.branch_type === 'satellite')" :key="b.id" :value="b.id">{{ b.name }}</option>
          </optgroup>
        </select>
        <select v-model="has" class="h-10 w-32 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15">
          <option value="">사진 전체</option>
          <option value="has_photos">사진 있음</option>
          <option value="no_photos">사진 없음</option>
        </select>
        <button
          type="button" @click="applyFilters" :disabled="pending"
          aria-label="검색" title="검색"
          class="h-10 w-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-4 focus:ring-primary/30 inline-flex items-center justify-center disabled:opacity-60"
        >
          <Loader2 v-if="pending" class="h-4 w-4 animate-spin" />
          <Search v-else class="h-4 w-4" />
        </button>
        <span class="ml-auto text-xs text-muted-foreground tabular-nums">
          {{ showingFrom }}–{{ showingTo }} / 총 {{ paged?.total ?? 0 }}명
        </span>
      </div>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">어르신</th>
            <th class="py-3 px-3 font-medium">지점</th>
            <th class="py-3 px-3 font-medium text-right">발송 예정</th>
            <th class="py-3 px-3 font-medium text-right">마지막 발송</th>
          </tr>
        </thead>
        <tbody v-if="pending && !paged">
          <tr v-for="i in 8" :key="`sk-${i}`" class="border-t">
            <td class="py-3 px-6"><Skeleton w="6rem" /></td>
            <td class="py-3 px-3"><Skeleton w="7rem" /></td>
            <td class="py-3 px-3 text-right"><Skeleton w="2rem" class="ml-auto" /></td>
            <td class="py-3 px-3 text-right"><Skeleton w="3rem" class="ml-auto" /></td>
          </tr>
        </tbody>
        <tbody v-else-if="error">
          <tr><td colspan="4" class="py-12 text-center text-destructive">
            <AlertCircle class="h-8 w-8 mx-auto mb-2" />
            불러오기 실패 <button class="underline ml-2" @click="refresh()">다시 시도</button>
          </td></tr>
        </tbody>
        <tbody v-else>
          <tr v-for="r in paged?.items ?? []" :key="r.resident_id" class="border-t">
            <td class="py-3 px-6">
              <div class="flex items-center gap-3">
                <div class="h-8 w-8 rounded-full bg-gradient-to-br from-primary/80 to-primary/40 text-primary-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {{ r.resident_name.charAt(0) }}
                </div>
                <NuxtLink
                  :to="`/residents/${r.resident_id}`"
                  class="font-medium hover:text-primary hover:underline underline-offset-2"
                >
                  {{ r.resident_name }}
                </NuxtLink>
              </div>
            </td>
            <td class="py-3 px-3">
              <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 class="h-3 w-3" />
                {{ r.branch_name }}
              </div>
            </td>
            <td class="py-3 px-3 text-right">
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
                :class="r.picked_count === 0
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary/10 text-primary'"
              >
                {{ r.picked_count }}장
              </span>
            </td>
            <td class="py-3 px-3 text-right text-xs text-muted-foreground tabular-nums">{{ r.last_sent_month ?? "—" }}</td>
          </tr>
          <tr v-if="(paged?.items?.length ?? 0) === 0">
            <td colspan="4" class="py-12 text-center text-muted-foreground">
              <Camera class="h-10 w-10 mx-auto mb-3 opacity-30" />
              조건에 맞는 어르신이 없습니다.
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="(paged?.total ?? 0) > 0" class="px-6 py-3 border-t flex items-center justify-between text-sm">
        <div class="text-xs text-muted-foreground">페이지 {{ paged?.page ?? 1 }} / {{ totalPages }}</div>
        <div class="flex items-center gap-2">
          <select v-model.number="pageSize" class="h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:border-primary">
            <option :value="25">25/page</option>
            <option :value="50">50/page</option>
            <option :value="100">100/page</option>
          </select>
          <button class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40" :disabled="page <= 1" @click="page--">
            <ChevronLeft class="h-4 w-4" />
          </button>
          <button class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40" :disabled="page >= totalPages" @click="page++">
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
