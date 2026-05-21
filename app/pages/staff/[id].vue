<script setup lang="ts">
import { ArrowLeft, Mail, Phone, Building2, Briefcase, Calendar, FileText, Tag } from "@lucide/vue";

const route = useRoute();
const id = route.params.id as string;
const api = useApi();

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
  hired_on: string | null;
  contract_end_on: string | null;
}

const { data: p, error } = await useAsyncData(`staff-${id}`, () =>
  api.get<Person>(`/v1/staff/${id}`),
);

useHead({ title: () => `${p.value?.full_name ?? "직원"} · 케어닥 HQ` });

const tone: Record<string, string> = {
  regular: "bg-primary/10 text-primary",
  contract: "bg-blue-100 text-blue-700",
  part_time: "bg-violet-100 text-violet-700",
  temporary: "bg-blue-100 text-blue-700",
  arbeit: "bg-pink-100 text-pink-700",
  consultant: "bg-rose-100 text-rose-700",
};
</script>

<template>
  <div class="px-8 py-6 max-w-4xl mx-auto">
    <NuxtLink
      to="/org"
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
    >
      <ArrowLeft class="h-4 w-4" />
      조직도
    </NuxtLink>

    <div v-if="error" class="text-sm text-destructive py-12 text-center">
      직원 정보를 불러오지 못했습니다.
    </div>

    <template v-else-if="p">
      <header class="rounded-2xl border bg-gradient-to-br from-primary/10 to-card p-6 mb-6 flex items-center gap-5">
        <div class="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-3xl font-bold flex-shrink-0">
          {{ p.full_name.charAt(0) }}
        </div>
        <div class="min-w-0">
          <h1 class="text-2xl font-bold tracking-tight">{{ p.full_name }}</h1>
          <div class="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
            <Briefcase class="h-3.5 w-3.5" />
            <span>{{ p.position_ko }}</span>
            <span>·</span>
            <span
              class="px-1.5 py-0.5 rounded text-xs font-medium"
              :class="tone[p.employment_type] ?? 'bg-muted'"
            >{{ p.employment_type_ko }}</span>
            <template v-if="p.branch_name">
              <span>·</span>
              <Building2 class="h-3.5 w-3.5" />
              <NuxtLink :to="`/branches/${p.branch_id}`" class="hover:text-primary underline-offset-4 hover:underline">
                {{ p.branch_name }}
              </NuxtLink>
            </template>
          </div>
        </div>
      </header>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="rounded-xl border bg-card p-5">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">연락처</h2>
          <dl class="text-sm space-y-2.5">
            <div class="flex items-start gap-3">
              <Mail class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground">이메일</dt>
                <dd class="font-mono text-xs break-all">{{ p.email }}</dd>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <Phone class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <dt class="text-xs text-muted-foreground">전화</dt>
                <dd>{{ p.phone ?? "—" }}</dd>
              </div>
            </div>
          </dl>
        </div>

        <div class="rounded-xl border bg-card p-5">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">고용 정보</h2>
          <dl class="text-sm space-y-2.5">
            <div class="flex items-start gap-3">
              <Tag class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <dt class="text-xs text-muted-foreground">고용 형태</dt>
                <dd>{{ p.employment_type_ko }}</dd>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <Calendar class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <dt class="text-xs text-muted-foreground">입사일</dt>
                <dd>{{ p.hired_on ?? "—" }}</dd>
              </div>
            </div>
            <div v-if="p.contract_end_on" class="flex items-start gap-3">
              <FileText class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <dt class="text-xs text-muted-foreground">계약 만료</dt>
                <dd>{{ p.contract_end_on }}</dd>
              </div>
            </div>
          </dl>
        </div>
      </div>

      <div class="mt-4 rounded-xl border bg-card p-5">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          최근 활동 (예정)
        </h2>
        <p class="text-sm text-muted-foreground">
          최근 시프트 출근/퇴근 기록, 작성한 케어 로그, 사용한 휴가 등이 표시됩니다 (다음 슬라이스).
        </p>
      </div>
    </template>
  </div>
</template>
