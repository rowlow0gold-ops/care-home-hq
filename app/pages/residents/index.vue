<script setup lang="ts">
import { Search, Plus } from "lucide-vue-next";

useHead({ title: "어르신 · 케어닥 HQ" });

interface Resident {
  id: string;
  branch_id: string;
  branch_name: string;
  name: string;
  birth_date: string;
  sex: "M" | "F";
  ltci_grade: number | null;
  admitted_at: string | null;
  status: "active" | "discharged" | "deceased";
}

const api = useApi();
const q = ref("");
const debouncedQ = refDebounced(q, 250);

const { data, pending, error, refresh } = await useAsyncData(
  "residents",
  () =>
    api.get<{ items: Resident[] }>("/v1/residents", {
      q: debouncedQ.value || undefined,
    }),
  { watch: [debouncedQ] },
);

const sexLabel: Record<Resident["sex"], string> = { M: "남", F: "여" };
const statusLabel: Record<Resident["status"], string> = {
  active: "재원",
  discharged: "퇴소",
  deceased: "사망",
};
const statusTone: Record<Resident["status"], string> = {
  active: "bg-primary/10 text-primary",
  discharged: "bg-muted text-muted-foreground",
  deceased: "bg-destructive/10 text-destructive",
};

function age(birth: string) {
  const b = new Date(birth);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (
    now.getMonth() < b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())
  ) {
    a--;
  }
  return a;
}
</script>

<template>
  <div class="px-8 py-6">
    <header class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">어르신</h1>
        <p class="text-sm text-muted-foreground">
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

    <Card>
      <div class="mb-4 relative max-w-sm">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input v-model="q" placeholder="이름으로 검색" class="pl-9" />
      </div>

      <div v-if="pending && !data" class="py-8 text-center text-sm text-muted-foreground">
        불러오는 중…
      </div>
      <div v-else-if="error" class="py-8 text-center text-sm text-destructive">
        목록을 불러오지 못했습니다.
        <button class="underline ml-2" @click="refresh()">다시 시도</button>
      </div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground border-b">
            <th class="py-2 pr-4 font-medium">이름</th>
            <th class="py-2 pr-4 font-medium">지점</th>
            <th class="py-2 pr-4 font-medium">성별</th>
            <th class="py-2 pr-4 font-medium text-right">나이</th>
            <th class="py-2 pr-4 font-medium text-right">장기요양 등급</th>
            <th class="py-2 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in data?.items ?? []"
            :key="r.id"
            class="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
            @click="navigateTo(`/residents/${r.id}`)"
          >
            <td class="py-3 pr-4 font-medium">{{ r.name }}</td>
            <td class="py-3 pr-4 text-muted-foreground">{{ r.branch_name }}</td>
            <td class="py-3 pr-4">{{ sexLabel[r.sex] }}</td>
            <td class="py-3 pr-4 text-right">{{ age(r.birth_date) }}세</td>
            <td class="py-3 pr-4 text-right">
              {{ r.ltci_grade !== null ? `${r.ltci_grade}등급` : "—" }}
            </td>
            <td class="py-3">
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                :class="statusTone[r.status]"
              >
                {{ statusLabel[r.status] }}
              </span>
            </td>
          </tr>
          <tr v-if="(data?.items ?? []).length === 0">
            <td colspan="6" class="py-8 text-center text-muted-foreground">
              {{ q ? `"${q}" 검색 결과 없음` : "등록된 어르신이 없습니다." }}
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>
</template>
