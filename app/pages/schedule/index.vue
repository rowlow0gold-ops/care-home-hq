<script setup lang="ts">
import { Sun, Moon, Sunrise } from "lucide-vue-next";

useHead({ title: "근무 일정 · 케어닥 HQ" });

interface Staff {
  id: string;
  email: string;
  full_name: string;
  role: "caregiver" | "nurse" | "branch_manager" | "hq" | "super_admin";
  phone: string | null;
  branch_id: string | null;
  deactivated_at: string | null;
}
interface Branch {
  id: string;
  name: string;
}

const api = useApi();

const [{ data: staff }, { data: dashboard }] = await Promise.all([
  useAsyncData("schedule-staff", () => api.get<Staff[]>("/v1/staff")),
  useAsyncData("schedule-dashboard", () =>
    api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
  ),
]);

const branchById = computed(() => {
  const m = new Map<string, string>();
  for (const b of dashboard.value?.branches ?? []) m.set(b.id, b.name);
  return m;
});

const active = computed(() =>
  (staff.value ?? []).filter(
    (s) => !s.deactivated_at && ["caregiver", "nurse"].includes(s.role),
  ),
);

const grouped = computed(() => {
  const out: Record<string, Staff[]> = {};
  for (const s of active.value) {
    const k = s.branch_id ? (branchById.value.get(s.branch_id) ?? "기타") : "본부";
    (out[k] ??= []).push(s);
  }
  return Object.entries(out).sort(([a], [b]) => a.localeCompare(b, "ko"));
});

// v1 placeholder: assign every active caregiver to "주간" until a real shift
// model lands. The router has a TODO for adding a `shifts` table.
const shifts = [
  { id: "morning", label: "주간 (06:00 - 14:00)", icon: Sunrise, tone: "bg-amber-100 text-amber-800" },
  { id: "evening", label: "저녁 (14:00 - 22:00)", icon: Sun, tone: "bg-orange-100 text-orange-800" },
  { id: "night",   label: "야간 (22:00 - 06:00)", icon: Moon, tone: "bg-indigo-100 text-indigo-800" },
];
</script>

<template>
  <div class="px-8 py-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold">근무 일정</h1>
      <p class="text-sm text-muted-foreground">
        지점별 요양보호사·간호사 명단. 시프트 관리 기능은 v0.2에서 추가됩니다.
      </p>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <Card v-for="s in shifts" :key="s.id">
        <div class="flex items-center gap-2">
          <component :is="s.icon" class="h-4 w-4 text-muted-foreground" />
          <span class="text-sm font-medium">{{ s.label }}</span>
        </div>
        <p class="text-2xl font-bold mt-2">{{ active.length }}명</p>
        <p class="text-xs text-muted-foreground">현재는 전체 명단 표시 (시프트 미구현)</p>
      </Card>
    </div>

    <div class="space-y-4">
      <Card v-for="[branchName, list] in grouped" :key="branchName" :title="branchName">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground border-b">
              <th class="py-2 pr-4 font-medium">이름</th>
              <th class="py-2 pr-4 font-medium">역할</th>
              <th class="py-2 pr-4 font-medium">이메일</th>
              <th class="py-2 font-medium">연락처</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in list" :key="s.id" class="border-b last:border-0">
              <td class="py-2 pr-4 font-medium">{{ s.full_name }}</td>
              <td class="py-2 pr-4">
                {{ s.role === "caregiver" ? "요양보호사" : "간호사" }}
              </td>
              <td class="py-2 pr-4 text-muted-foreground">{{ s.email }}</td>
              <td class="py-2 text-muted-foreground">{{ s.phone ?? "—" }}</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  </div>
</template>
