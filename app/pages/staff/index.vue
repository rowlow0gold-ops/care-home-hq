<script setup lang="ts">
useHead({ title: "직원 관리 · 케어닥 HQ" });

interface Staff {
  id: string;
  email: string;
  full_name: string;
  role: "caregiver" | "nurse" | "branch_manager" | "hq" | "super_admin";
  phone: string | null;
  branch_id: string | null;
  deactivated_at: string | null;
  created_at: string;
}

const api = useApi();
const { data, pending, error } = await useAsyncData("staff", () =>
  api.get<Staff[]>("/v1/staff"),
);

const roleLabel: Record<Staff["role"], string> = {
  caregiver: "요양보호사",
  nurse: "간호사",
  branch_manager: "지점장",
  hq: "본부",
  super_admin: "시스템 관리자",
};
</script>
<template>
  <div class="px-8 py-6">
    <h1 class="text-2xl font-bold mb-2">직원 관리</h1>
    <p class="text-sm text-muted-foreground mb-6">전 지점 직원 명단·권한 관리.</p>

    <Card>
      <div v-if="pending" class="text-sm text-muted-foreground py-8 text-center">불러오는 중…</div>
      <div v-else-if="error" class="text-sm text-destructive py-8 text-center">불러오기 실패</div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground border-b">
            <th class="py-2 pr-4 font-medium">이름</th>
            <th class="py-2 pr-4 font-medium">이메일</th>
            <th class="py-2 pr-4 font-medium">역할</th>
            <th class="py-2 pr-4 font-medium">연락처</th>
            <th class="py-2 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in data ?? []" :key="s.id" class="border-b last:border-0">
            <td class="py-3 pr-4 font-medium">{{ s.full_name }}</td>
            <td class="py-3 pr-4 text-muted-foreground">{{ s.email }}</td>
            <td class="py-3 pr-4">{{ roleLabel[s.role] }}</td>
            <td class="py-3 pr-4 text-muted-foreground">{{ s.phone ?? "—" }}</td>
            <td class="py-3">
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                :class="!s.deactivated_at ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
              >
                {{ !s.deactivated_at ? "활성" : "비활성" }}
              </span>
            </td>
          </tr>
          <tr v-if="(data ?? []).length === 0">
            <td colspan="5" class="py-8 text-center text-muted-foreground">직원이 없습니다.</td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>
</template>
