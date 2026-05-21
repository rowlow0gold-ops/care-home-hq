<script setup lang="ts">
import { Tablet, Copy, RefreshCw, Sun, Moon, User, Mail, Briefcase, Building2, Phone, Info } from "@lucide/vue";

useHead({ title: "설정 · 케어닥 HQ" });

interface Branch {
  id: string;
  name: string;
  resident_count: number;
  occupancy_pct: number;
}

const { me } = useAuth();
const { isDark, toggle } = useDarkMode();
const api = useApi();
const toast = useToast();

const { data: dashboard } = await useAsyncData("settings-dashboard", () =>
  api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

// Pair-code generator (visible only to branch_manager+)
const pairLabel = ref("");
const pairing = ref(false);
const pairCode = ref<string | null>(null);
const pairExpires = ref<string | null>(null);
const pairError = ref<string | null>(null);

const canIssuePair = computed(() =>
  ["branch_manager", "hq", "super_admin"].includes(me.value?.role ?? ""),
);

async function issuePairCode() {
  if (pairing.value || !pairLabel.value) return;
  pairing.value = true;
  pairError.value = null;
  try {
    const res = await api.post<{ code: string; expires_at: string; label: string }>(
      "/v1/devices/pair-code",
      { label: pairLabel.value },
    );
    pairCode.value = res.code;
    pairExpires.value = res.expires_at;
  } catch (err: any) {
    pairError.value = err?.data?.message ?? err?.statusMessage ?? "코드 발급 실패";
  } finally {
    pairing.value = false;
  }
}

function copy() {
  if (!pairCode.value) return;
  navigator.clipboard.writeText(pairCode.value);
  toast.success("복사되었습니다");
}

function reset() {
  pairCode.value = null;
  pairExpires.value = null;
  pairLabel.value = "";
}

const roleLabel: Record<string, string> = {
  caregiver: "요양보호사",
  nurse: "간호사",
  branch_manager: "지점장",
  hq: "본부",
  super_admin: "시스템 관리자",
};
</script>

<template>
  <div class="px-8 py-6 max-w-4xl mx-auto">
    <header class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight">설정</h1>
      <p class="text-sm text-muted-foreground mt-1">
        개인 계정 정보, 화면 테마, 그리고 태블릿 페어링을 관리합니다.
      </p>
    </header>

    <div class="space-y-4">
      <!-- INTERNAL/HOVER HELP -->
      <div class="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-start gap-2 text-xs text-foreground/80">
        <Info class="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
        <span>
          이 페이지는 <strong>개인 + 운영 설정</strong>입니다. 본인 계정 정보 확인, 라이트/다크 테마 전환,
          그리고 (지점장 이상) 새 태블릿 페어링 코드 발급을 할 수 있습니다.
        </span>
      </div>

      <!-- 내 정보 -->
      <div class="rounded-xl border bg-card overflow-hidden">
        <div class="px-6 py-4 border-b flex items-center gap-2">
          <User class="h-4 w-4 text-primary" />
          <h2 class="font-semibold">내 정보</h2>
        </div>
        <div class="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="flex items-center gap-3">
            <div class="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-lg font-semibold">
              {{ me?.name?.charAt(0) }}
            </div>
            <div class="min-w-0">
              <div class="font-medium">{{ me?.name }}</div>
              <div class="text-xs text-muted-foreground">{{ roleLabel[me?.role ?? ""] ?? me?.role }}</div>
            </div>
          </div>
          <dl class="text-sm space-y-2">
            <div class="flex items-center gap-2">
              <Mail class="h-3.5 w-3.5 text-muted-foreground" />
              <span class="font-mono text-xs">{{ me?.email }}</span>
            </div>
            <div class="flex items-center gap-2">
              <Briefcase class="h-3.5 w-3.5 text-muted-foreground" />
              <span>{{ me?.tenant_name }}</span>
              <template v-if="me?.branch_name">
                <span class="text-muted-foreground">·</span>
                <span>{{ me.branch_name }}</span>
              </template>
            </div>
          </dl>
        </div>
      </div>

      <!-- 화면 테마 -->
      <div class="rounded-xl border bg-card overflow-hidden">
        <div class="px-6 py-4 border-b flex items-center gap-2">
          <component :is="isDark ? Moon : Sun" class="h-4 w-4 text-primary" />
          <h2 class="font-semibold">화면 테마</h2>
        </div>
        <div class="p-6 flex items-center justify-between">
          <div>
            <div class="text-sm font-medium">{{ isDark ? "다크 모드" : "라이트 모드" }}</div>
            <div class="text-xs text-muted-foreground mt-1">
              야간 근무 중에는 다크 모드를 권장합니다.
            </div>
          </div>
          <button
            class="h-10 px-4 rounded-lg border bg-card hover:bg-muted text-sm font-medium flex items-center gap-2 transition-colors"
            @click="toggle"
          >
            <component :is="isDark ? Sun : Moon" class="h-4 w-4" />
            {{ isDark ? "라이트로 전환" : "다크로 전환" }}
          </button>
        </div>
      </div>

      <!-- 지점 현황 (HQ만 보일 만큼 의미 있음, 지점장은 자기 지점만) -->
      <div class="rounded-xl border bg-card overflow-hidden">
        <div class="px-6 py-4 border-b flex items-center gap-2">
          <Building2 class="h-4 w-4 text-primary" />
          <h2 class="font-semibold">지점 현황</h2>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground bg-muted/30">
              <th class="py-2 px-6 font-medium">지점명</th>
              <th class="py-2 px-3 font-medium text-right">어르신</th>
              <th class="py-2 px-6 font-medium text-right">입소율</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in dashboard?.branches ?? []" :key="b.id" class="border-t">
              <td class="py-2 px-6 font-medium">{{ b.name }}</td>
              <td class="py-2 px-3 text-right tabular-nums">{{ b.resident_count }}</td>
              <td class="py-2 px-6 text-right tabular-nums">{{ b.occupancy_pct.toFixed(1) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 태블릿 페어링 -->
      <div v-if="canIssuePair" class="rounded-xl border bg-card overflow-hidden">
        <div class="px-6 py-4 border-b flex items-center gap-2">
          <Tablet class="h-4 w-4 text-primary" />
          <h2 class="font-semibold">태블릿 페어링</h2>
        </div>
        <div class="p-6">
          <p class="text-xs text-muted-foreground mb-3">
            새 태블릿에 8자 코드를 발급합니다. <strong>15분간 유효한 일회용 코드</strong>입니다.
          </p>
          <template v-if="!pairCode">
            <div class="space-y-3">
              <div class="space-y-1">
                <Label for="pl">태블릿 이름</Label>
                <Input id="pl" v-model="pairLabel" placeholder="강남센터 1층 스테이션" />
              </div>
              <Button :disabled="!pairLabel || pairing" @click="issuePairCode">
                <Tablet class="h-4 w-4" />
                {{ pairing ? "발급 중..." : "페어링 코드 발급" }}
              </Button>
              <div v-if="pairError" class="text-sm text-destructive">{{ pairError }}</div>
            </div>
          </template>
          <template v-else>
            <div class="rounded-lg border-2 border-primary bg-primary/5 p-6 text-center">
              <div class="text-xs text-muted-foreground mb-2">아래 코드를 태블릿에 입력하세요</div>
              <div class="text-5xl font-mono font-bold tracking-widest text-primary">{{ pairCode }}</div>
              <div class="text-xs text-muted-foreground mt-2">
                만료: {{ new Date(pairExpires!).toLocaleString("ko-KR") }}
              </div>
              <div class="flex gap-2 mt-4 justify-center">
                <Button variant="outline" @click="copy"><Copy class="h-4 w-4" />복사</Button>
                <Button variant="outline" @click="reset"><RefreshCw class="h-4 w-4" />다시 발급</Button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
