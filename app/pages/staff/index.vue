<script setup lang="ts">
import { Search, Building2 } from "@lucide/vue";

useHead({ title: "직원 관리 · 케어닥 HQ" });

interface Person {
  id: string;
  branch_id: string | null;
  branch_name: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  position: string;
  position_ko: string;
  employment_type: string;
  employment_type_ko: string;
  is_inactive: boolean;
}
interface Branch { id: string; name: string }

const api = useApi();
const q = ref("");
const debouncedQ = refDebounced(q, 250);
const branchFilter = ref<string>("");
const empFilter = ref<string>("");

const [{ data: people, pending, error }, { data: dashboard }] = await Promise.all([
  useAsyncData("staff-list", () => api.get<Person[]>("/v1/org/chart")),
  useAsyncData("staff-branches", () => api.get<{ branches: Branch[] }>("/v1/dashboard/summary")),
]);

const filtered = computed(() => {
  let rows = people.value ?? [];
  if (branchFilter.value === "__hq__") rows = rows.filter((p) => !p.branch_id);
  else if (branchFilter.value) rows = rows.filter((p) => p.branch_id === branchFilter.value);
  if (empFilter.value) rows = rows.filter((p) => p.employment_type === empFilter.value);
  if (debouncedQ.value) {
    const n = debouncedQ.value.toLowerCase();
    rows = rows.filter(
      (p) =>
        p.full_name.toLowerCase().includes(n) ||
        p.email.toLowerCase().includes(n) ||
        p.position_ko.includes(debouncedQ.value),
    );
  }
  return rows;
});

const tone: Record<string, string> = {
  regular: "bg-primary/10 text-primary",
  contract: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  short_contract: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-200",
  part_time: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200",
  temporary: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  arbeit: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-200",
  dispatched: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
  consultant: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200",
};
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight">직원 관리</h1>
      <p class="text-sm text-muted-foreground mt-1">전 지점 직원 + 본사 인력. 이름 클릭 → 상세 페이지.</p>
    </header>

    <div class="rounded-xl border bg-card overflow-hidden">
      <div class="px-6 py-4 border-b flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            v-model="q"
            placeholder="이름 / 이메일 / 직책 검색"
            class="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
        </div>
        <select
          v-model="branchFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 (본사 + 지점)</option>
          <option value="__hq__">본사만</option>
          <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <select
          v-model="empFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 고용형태</option>
          <option value="regular">정규직</option>
          <option value="contract">계약직</option>
          <option value="short_contract">단기계약직</option>
          <option value="part_time">시간제</option>
          <option value="arbeit">아르바이트</option>
          <option value="dispatched">파견직</option>
          <option value="consultant">위촉직</option>
        </select>
        <div class="ml-auto text-xs text-muted-foreground tabular-nums">
          {{ filtered.length }} / {{ (people ?? []).length }}명
        </div>
      </div>

      <div v-if="pending" class="py-12 text-center text-sm text-muted-foreground">불러오는 중…</div>
      <div v-else-if="error" class="py-12 text-center text-sm text-destructive">불러오기 실패</div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">이름</th>
            <th class="py-3 px-3 font-medium">소속</th>
            <th class="py-3 px-3 font-medium">직책</th>
            <th class="py-3 px-3 font-medium">고용</th>
            <th class="py-3 px-3 font-medium">이메일</th>
            <th class="py-3 px-6 font-medium">전화</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in filtered"
            :key="p.id"
            class="border-t hover:bg-muted/40 cursor-pointer transition-colors"
            @click="navigateTo(`/staff/${p.id}`)"
          >
            <td class="py-3 px-6 font-medium">{{ p.full_name }}</td>
            <td class="py-3 px-3">
              <div class="flex items-center gap-1.5 text-xs">
                <Building2 class="h-3 w-3 text-muted-foreground" />
                {{ p.branch_name ?? "본사" }}
              </div>
            </td>
            <td class="py-3 px-3">{{ p.position_ko }}</td>
            <td class="py-3 px-3">
              <span
                class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                :class="tone[p.employment_type] ?? 'bg-muted'"
              >
                {{ p.employment_type_ko }}
              </span>
            </td>
            <td class="py-3 px-3 text-muted-foreground font-mono text-xs truncate max-w-[14rem]">{{ p.email }}</td>
            <td class="py-3 px-6 text-muted-foreground">{{ p.phone ?? "—" }}</td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="6" class="py-12 text-center text-muted-foreground">조건에 맞는 직원이 없습니다.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
