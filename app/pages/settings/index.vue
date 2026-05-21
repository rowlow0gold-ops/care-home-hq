<script setup lang="ts">
import { Tablet, Copy, RefreshCw } from "@lucide/vue";

useHead({ title: "설정 · 케어닥 HQ" });

interface Branch {
  id: string;
  name: string;
  resident_count: number;
  occupancy_pct: number;
}

const { me } = useAuth();
const api = useApi();

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
    pairError.value =
      err?.data?.message ?? err?.statusMessage ?? "코드 발급 실패";
  } finally {
    pairing.value = false;
  }
}

function copy() {
  if (!pairCode.value) return;
  navigator.clipboard.writeText(pairCode.value);
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
  <div class="px-8 py-6 max-w-4xl">
    <h1 class="text-2xl font-bold mb-2">설정</h1>
    <p class="text-sm text-muted-foreground mb-6">계정 · 지점 · 태블릿 페어링</p>

    <div class="space-y-4">
      <Card title="내 계정">
        <dl class="grid grid-cols-3 gap-y-2 text-sm">
          <dt class="text-muted-foreground">이름</dt>
          <dd class="col-span-2">{{ me?.name }}</dd>
          <dt class="text-muted-foreground">이메일</dt>
          <dd class="col-span-2">{{ me?.email }}</dd>
          <dt class="text-muted-foreground">역할</dt>
          <dd class="col-span-2">{{ roleLabel[me?.role ?? ""] ?? me?.role }}</dd>
          <dt class="text-muted-foreground">소속</dt>
          <dd class="col-span-2">
            {{ me?.tenant_name }}
            <template v-if="me?.branch_name"> · {{ me.branch_name }}</template>
          </dd>
        </dl>
      </Card>

      <Card title="지점 현황">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground border-b">
              <th class="py-2 pr-4 font-medium">지점명</th>
              <th class="py-2 pr-4 font-medium text-right">어르신</th>
              <th class="py-2 font-medium text-right">입소율</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in dashboard?.branches ?? []" :key="b.id" class="border-b last:border-0">
              <td class="py-2 pr-4 font-medium">{{ b.name }}</td>
              <td class="py-2 pr-4 text-right">{{ b.resident_count }}</td>
              <td class="py-2 text-right">{{ b.occupancy_pct.toFixed(1) }}%</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card v-if="canIssuePair" title="태블릿 페어링" description="새 태블릿에 8자 코드를 발급합니다. 15분간 유효한 일회용 코드.">
        <template v-if="!pairCode">
          <div class="space-y-3">
            <div class="space-y-1">
              <Label for="pl">태블릿 이름</Label>
              <Input
                id="pl"
                v-model="pairLabel"
                placeholder="강남센터 1층 스테이션"
              />
            </div>
            <Button
              :disabled="!pairLabel || pairing"
              @click="issuePairCode"
            >
              <Tablet class="h-4 w-4" />
              {{ pairing ? "발급 중..." : "페어링 코드 발급" }}
            </Button>
            <div v-if="pairError" class="text-sm text-destructive">{{ pairError }}</div>
          </div>
        </template>

        <template v-else>
          <div class="rounded-lg border-2 border-primary bg-primary/5 p-6 text-center">
            <div class="text-xs text-muted-foreground mb-2">아래 코드를 태블릿에 입력하세요</div>
            <div class="text-5xl font-mono font-bold tracking-widest text-primary">
              {{ pairCode }}
            </div>
            <div class="text-xs text-muted-foreground mt-2">
              만료: {{ new Date(pairExpires!).toLocaleString("ko-KR") }}
            </div>
            <div class="flex gap-2 mt-4 justify-center">
              <Button variant="outline" @click="copy">
                <Copy class="h-4 w-4" />
                복사
              </Button>
              <Button variant="outline" @click="reset">
                <RefreshCw class="h-4 w-4" />
                다시 발급
              </Button>
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>
