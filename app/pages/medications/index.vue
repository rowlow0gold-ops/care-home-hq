<script setup lang="ts">
import { Pill, Search, Loader2, ChevronLeft, ChevronRight } from "@lucide/vue";

useHead({ title: "투약 · 케어닥 HQ" });

interface Branch { id: string; name: string }
interface MedicationRow {
  id: string;
  tenant_id: string;
  branch_id: string;
  branch_name: string | null;
  resident_id: string;
  resident_name: string;
  resident_room: string | null;
  name: string;
  dosage: string;
  frequency: string;
  route: string | null;
  start_date: string;
  end_date: string | null;
  prescriber: string | null;
  instructions: string | null;
  is_active: boolean;
}
interface PagedMedications {
  items: MedicationRow[];
  total: number;
  page: number;
  page_size: number;
}

const api = useApi();

// Draft filters
const showStopped = ref(false);
const branchFilter = ref<string>(useDefaultBranch());
const search = ref("");
// Applied
const appliedShowStopped = ref(showStopped.value);
const appliedBranch = ref(branchFilter.value);
const appliedSearch = ref("");

const page = ref(1);
const pageSize = ref(50);

function applyFilters() {
  appliedShowStopped.value = showStopped.value;
  appliedBranch.value = branchFilter.value;
  appliedSearch.value = search.value.trim();
  page.value = 1;
}

const { data: dashboard } = await useAsyncData("med-branches", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

const { data: paged, pending, error, refresh } = await useAsyncData(
  "medications-paged",
  () =>
    api.get<PagedMedications>("/v1/medications/paged", {
      q: appliedSearch.value || undefined,
      branch_id: appliedBranch.value || undefined,
      include_stopped: appliedShowStopped.value || undefined,
      page: page.value,
      page_size: pageSize.value,
    }),
  { watch: [appliedSearch, appliedBranch, appliedShowStopped, page, pageSize] },
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

// Group by resident for display (server already orders by resident_name)
const grouped = computed(() => {
  const out: Record<string, MedicationRow[]> = {};
  for (const m of paged.value?.items ?? []) {
    (out[m.resident_name] ??= []).push(m);
  }
  return Object.entries(out);
});
</script>

<template>
  <div class="px-8 py-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold">투약 관리</h1>
      <p class="text-sm text-muted-foreground">
        어르신별 현재 투약 처방. 중단된 항목 토글로 이력 확인 가능.
      </p>
    </header>

    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <div class="relative flex-1 min-w-[220px] max-w-sm">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="어르신 / 약품명 / 처방의 검색"
          class="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          @keyup.enter="applyFilters"
        >
      </div>
      <select
        v-model="branchFilter"
        class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
      >
        <option value="">전체 지점</option>
        <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
      </select>
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input v-model="showStopped" type="checkbox" class="rounded border-input">
        중단된 처방 포함
      </label>
      <button
        type="button"
        @click="applyFilters"
        :disabled="pending"
        aria-label="검색"
        title="검색"
        class="h-10 w-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-4 focus:ring-primary/30 inline-flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Loader2 v-if="pending" class="h-4 w-4 animate-spin" />
        <Search v-else class="h-4 w-4" />
      </button>
      <div class="ml-auto text-xs text-muted-foreground tabular-nums">
        {{ showingFrom }}–{{ showingTo }} / {{ paged?.total ?? 0 }}건
      </div>
    </div>

    <div v-if="pending && !paged" class="text-sm text-muted-foreground py-8 text-center">
      불러오는 중…
    </div>
    <div v-else-if="error" class="py-12 text-center text-sm text-destructive">
      목록을 불러오지 못했습니다.
      <button class="underline ml-2" @click="refresh()">다시 시도</button>
    </div>
    <div v-else-if="grouped.length === 0" class="py-12 text-center text-sm text-muted-foreground">
      <Pill class="h-10 w-10 mx-auto mb-3 opacity-30" />
      조건에 맞는 처방이 없습니다.
    </div>

    <div v-else class="space-y-4">
      <Card v-for="[residentName, meds] in grouped" :key="residentName">
        <div class="flex items-center gap-2 mb-3 pb-3 border-b">
          <Pill class="h-4 w-4 text-primary" />
          <h3 class="font-semibold">{{ residentName }}</h3>
          <span v-if="meds[0]?.resident_room" class="text-xs text-muted-foreground">
            · {{ meds[0].resident_room }}호
          </span>
          <span v-if="meds[0]?.branch_name" class="text-xs text-muted-foreground ml-auto">
            {{ meds[0].branch_name }}
          </span>
        </div>

        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground border-b">
              <th class="py-2 pr-3 font-medium">약품명</th>
              <th class="py-2 pr-3 font-medium">용량</th>
              <th class="py-2 pr-3 font-medium">횟수</th>
              <th class="py-2 pr-3 font-medium">경로</th>
              <th class="py-2 pr-3 font-medium">처방의</th>
              <th class="py-2 font-medium">기간</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="m in meds"
              :key="m.id"
              class="border-b last:border-0"
              :class="!m.is_active ? 'text-muted-foreground line-through' : ''"
            >
              <td class="py-2 pr-3 font-medium">{{ m.name }}</td>
              <td class="py-2 pr-3">{{ m.dosage }}</td>
              <td class="py-2 pr-3">{{ m.frequency }}</td>
              <td class="py-2 pr-3">{{ m.route ?? "—" }}</td>
              <td class="py-2 pr-3">{{ m.prescriber ?? "—" }}</td>
              <td class="py-2 text-xs">
                {{ m.start_date }}
                <template v-if="m.end_date"> ~ {{ m.end_date }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <!-- Pagination -->
      <div class="flex items-center justify-between text-sm pt-2">
        <div class="text-xs text-muted-foreground">
          페이지 {{ paged?.page ?? 1 }} / {{ totalPages }}
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model.number="pageSize"
            class="h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:border-primary"
          >
            <option :value="25">25/page</option>
            <option :value="50">50/page</option>
            <option :value="100">100/page</option>
            <option :value="200">200/page</option>
          </select>
          <button
            class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="page <= 1"
            @click="page--"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>
          <button
            class="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="page >= totalPages"
            @click="page++"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
