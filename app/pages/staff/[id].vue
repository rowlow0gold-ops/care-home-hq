<script setup lang="ts">
import { ArrowLeft, Mail, Phone, Building2, Briefcase, Calendar, FileText, Tag, Wallet, Clock, CalendarOff } from "@lucide/vue";

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
  monthly_salary_krw: number | null;
  hourly_rate_est_krw: number | null;
}

interface StaffBalance {
  user_id: string;
  annual_allocated: number;
  annual_used: number;
  annual_remaining: number;
}

const { data: p, error } = await useAsyncData(`staff-${id}`, () =>
  api.get<Person>(`/v1/staff/${id}`),
);

// All-branch leave balances; we filter to this user. If the caller lacks
// access (RLS) the array is empty and we just hide the card.
const { data: balances } = await useAsyncData(`staff-${id}-balances`, () =>
  api.get<StaffBalance[]>("/v1/leave-requests/balances")
       .then((r) => r ?? [])
       .catch(() => [] as StaffBalance[]),
);
const myBalance = computed(() =>
  (balances.value ?? []).find((b) => b.user_id === id) ?? null,
);

// Annual leave at year end is paid out as 연차수당 (Korean labor law).
// Same rough average daily wage as on the 휴가 panel.
const PAYOUT_PER_DAY_KRW = 130_000;
const estimatedPayoutKRW = computed(() =>
  myBalance.value
    ? Math.round(myBalance.value.annual_remaining * PAYOUT_PER_DAY_KRW)
    : 0,
);

useHead({ title: () => `${p.value?.full_name ?? "직원"} · 케어닥 HQ` });

function fmtKRW(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `₩${n.toLocaleString("ko-KR")}`;
}

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

      <!-- 급여 + 잔여 연차 — what the boss actually cares about -->
      <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- 급여 -->
        <div class="rounded-xl border bg-card p-5">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Wallet class="h-3.5 w-3.5 text-primary" />
            급여
          </h2>
          <dl class="text-sm space-y-2.5">
            <div class="flex items-start gap-3">
              <Wallet class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div class="flex-1">
                <dt class="text-xs text-muted-foreground">월 기본급</dt>
                <dd class="text-2xl font-bold tabular-nums text-foreground mt-0.5">
                  {{ fmtKRW(p.monthly_salary_krw) }}
                </dd>
              </div>
            </div>
            <div v-if="p.employment_type === 'part_time' || p.hourly_rate_est_krw" class="flex items-start gap-3">
              <Clock class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div class="flex-1">
                <dt class="text-xs text-muted-foreground">
                  {{ p.employment_type === 'part_time' ? '시급' : '시급 환산' }}
                  <span class="text-[10px] opacity-70">(월급 ÷ 209h)</span>
                </dt>
                <dd class="font-medium tabular-nums text-foreground">
                  {{ fmtKRW(p.hourly_rate_est_krw) }}
                </dd>
              </div>
            </div>
          </dl>
        </div>

        <!-- 잔여 연차 -->
        <div class="rounded-xl border bg-card p-5">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <CalendarOff class="h-3.5 w-3.5 text-primary" />
            잔여 연차
          </h2>
          <div v-if="myBalance" class="text-sm space-y-2.5">
            <div class="flex items-start gap-3">
              <Calendar class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div class="flex-1">
                <dt class="text-xs text-muted-foreground">잔여 (부여 {{ myBalance.annual_allocated.toFixed(1) }}일 − 사용 {{ myBalance.annual_used.toFixed(1) }}일)</dt>
                <dd class="text-2xl font-bold tabular-nums text-primary mt-0.5">
                  {{ myBalance.annual_remaining.toFixed(1) }}일
                </dd>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <Wallet class="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div class="flex-1">
                <dt class="text-xs text-muted-foreground">미사용 시 연차수당 (추정)</dt>
                <dd class="font-medium tabular-nums text-foreground">
                  ≈ {{ fmtKRW(estimatedPayoutKRW) }}
                </dd>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-muted-foreground">
            잔여 연차 정보를 불러올 수 없습니다.
          </p>
        </div>
      </div>
    </template>
  </div>
</template>
