<script setup lang="ts">
import { Search, Plus, MapPin } from "@lucide/vue";

useHead({ title: "어르신 · 케어닥 HQ" });

interface Resident {
  id: string;
  tenant_id: string;
  branch_id: string;
  full_name: string;
  sex: "male" | "female" | "other";
  birth_date: string;
  care_grade: string | null;
  room_number: string | null;
  admitted_on: string;
  status: "active" | "discharged" | "deceased";
}
interface Branch { id: string; name: string }

const api = useApi();
const q = ref("");
const debouncedQ = refDebounced(q, 250);
const branchFilter = ref<string>("");
const gradeFilter = ref<string>("");

const [{ data: rawList, pending, error, refresh }, { data: dashboard }] = await Promise.all([
  useAsyncData("residents", () => api.get<Resident[]>("/v1/residents")),
  useAsyncData("res-branches", () => api.get<{ branches: Branch[] }>("/v1/dashboard/summary")),
]);

const branchById = computed(() => {
  const m = new Map<string, string>();
  for (const b of dashboard.value?.branches ?? []) m.set(b.id, b.name);
  return m;
});

const data = computed(() => {
  let items = rawList.value ?? [];
  if (branchFilter.value) items = items.filter((r) => r.branch_id === branchFilter.value);
  if (gradeFilter.value)  items = items.filter((r) => (r.care_grade ?? "") === gradeFilter.value);
  if (debouncedQ.value) {
    const needle = debouncedQ.value.toLowerCase();
    items = items.filter((r) =>
      r.full_name.toLowerCase().includes(needle) ||
      (r.room_number ?? "").toLowerCase().includes(needle),
    );
  }
  return items;
});

const sexLabel: Record<Resident["sex"], string> = { male: "남", female: "여", other: "기타" };
const statusLabel: Record<Resident["status"], string> = {
  active: "재원", discharged: "퇴소", deceased: "사망",
};
const statusTone: Record<Resident["status"], string> = {
  active: "bg-primary/10 text-primary",
  discharged: "bg-muted text-muted-foreground",
  deceased: "bg-destructive/10 text-destructive",
};

function gradeLabel(g: string | null) {
  if (!g) return "—";
  if (g === "cognitive_support") return "인지지원";
  return g + "등급";
}

function age(birth: string) {
  const b = new Date(birth);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">어르신</h1>
        <p class="text-sm text-muted-foreground mt-1">
          전 지점 입소자 명단. 클릭하면 활력징후·케어 기록을 볼 수 있습니다.
        </p>
      </div>
      <NuxtLink to="/residents/new">
        <Button>
          <Plus class="h-4 w-4" />
          입소 등록
        </Button>
      </NuxtLink>
    </header>

    <div class="rounded-xl border bg-card overflow-hidden">
      <!-- Filter bar -->
      <div class="px-6 py-4 border-b flex flex-wrap gap-3 items-center">
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            v-model="q"
            placeholder="이름 또는 호실 검색"
            class="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
        </div>
        <select
          v-model="branchFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 지점</option>
          <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <select
          v-model="gradeFilter"
          class="h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        >
          <option value="">전체 등급</option>
          <option value="1">1등급</option>
          <option value="2">2등급</option>
          <option value="3">3등급</option>
          <option value="4">4등급</option>
          <option value="5">5등급</option>
          <option value="cognitive_support">인지지원</option>
        </select>
        <div class="ml-auto text-xs text-muted-foreground tabular-nums">
          총 {{ data.length }}명 / {{ (rawList ?? []).length }}명
        </div>
      </div>

      <div v-if="pending && !rawList" class="py-12 text-center text-sm text-muted-foreground">
        불러오는 중…
      </div>
      <div v-else-if="error" class="py-12 text-center text-sm text-destructive">
        목록을 불러오지 못했습니다.
        <button class="underline ml-2" @click="refresh()">다시 시도</button>
      </div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground bg-muted/30">
            <th class="py-3 px-6 font-medium">이름</th>
            <th class="py-3 px-3 font-medium">지점</th>
            <th class="py-3 px-3 font-medium">호실</th>
            <th class="py-3 px-3 font-medium">성별</th>
            <th class="py-3 px-3 font-medium text-right">나이</th>
            <th class="py-3 px-3 font-medium text-right">장기요양</th>
            <th class="py-3 px-6 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in data"
            :key="r.id"
            class="border-t hover:bg-muted/40 cursor-pointer transition-colors"
            @click="navigateTo(`/residents/${r.id}`)"
          >
            <td class="py-3 px-6 font-medium">{{ r.full_name }}</td>
            <td class="py-3 px-3">
              <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin class="h-3 w-3" />
                {{ branchById.get(r.branch_id) ?? "—" }}
              </div>
            </td>
            <td class="py-3 px-3 text-muted-foreground tabular-nums">{{ r.room_number ?? "—" }}</td>
            <td class="py-3 px-3">{{ sexLabel[r.sex] }}</td>
            <td class="py-3 px-3 text-right tabular-nums">{{ age(r.birth_date) }}세</td>
            <td class="py-3 px-3 text-right">{{ gradeLabel(r.care_grade) }}</td>
            <td class="py-3 px-6">
              <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" :class="statusTone[r.status]">
                {{ statusLabel[r.status] }}
              </span>
            </td>
          </tr>
          <tr v-if="data.length === 0">
            <td colspan="7" class="py-12 text-center text-muted-foreground">
              {{ q || branchFilter || gradeFilter ? "조건에 맞는 결과가 없습니다." : "등록된 어르신이 없습니다." }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
