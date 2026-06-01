<script setup lang="ts">
/**
 * /settings/teams — branch manager + HQ create / rename / delete teams.
 *
 * Teams are sub-units within a branch (e.g. 주간팀, 야간팀, 본관팀). Each
 * staff member can belong to at most one team. Members count + colour
 * swatch are shown next to each team.
 */
import { Loader2, Plus, Pencil, Trash2, Users } from "@lucide/vue";

useHead({ title: "팀 관리 · 케어닥 HQ" });

const api    = useApi();
const toast  = useToast();
const { me } = useAuth();

const allowed = computed(() =>
  me.value?.role === "branch_manager" || me.value?.role === "hq" || me.value?.role === "super_admin",
);

interface Team {
  id: string; branch_id: string; branch_name: string | null;
  name: string; color_hue: number; sort_order: number;
  shift_start_hm: string; shift_end_hm: string;
  member_count: number; created_at: string;
}

const { data: teams, refresh } = await useAsyncData("teams", () => api.get<Team[]>("/v1/teams"));

// Create/edit composer
const editing = ref<Team | null>(null);
const creating = ref(false);
const formName  = ref("");
const formHue   = ref(200);
const formSort  = ref(0);
const formStart = ref("06:00");
const formEnd   = ref("18:00");
const saving    = ref(false);

function openCreate() {
  creating.value = true; editing.value = null;
  formName.value = ""; formHue.value = 200;
  formSort.value = (teams.value?.length ?? 0) + 1;
  formStart.value = "06:00"; formEnd.value = "18:00";
}
function openEdit(t: Team) {
  editing.value = t; creating.value = false;
  formName.value = t.name; formHue.value = t.color_hue; formSort.value = t.sort_order;
  formStart.value = t.shift_start_hm; formEnd.value = t.shift_end_hm;
}
function close() { editing.value = null; creating.value = false; }

async function save() {
  if (saving.value) return;
  if (!formName.value.trim()) { toast.error("팀 이름을 입력해주세요", "오류"); return; }
  saving.value = true;
  try {
    if (editing.value) {
      await api.patch(`/v1/teams/${editing.value.id}`, {
        name: formName.value.trim(),
        color_hue: formHue.value,
        sort_order: formSort.value,
        shift_start_hm: formStart.value,
        shift_end_hm:   formEnd.value,
      });
      toast.success("팀 정보 수정됨", "✅");
    } else {
      await api.post("/v1/teams", {
        name: formName.value.trim(),
        color_hue: formHue.value,
        sort_order: formSort.value,
        shift_start_hm: formStart.value,
        shift_end_hm:   formEnd.value,
      });
      toast.success(`팀 '${formName.value}' 추가됨`, "✅");
    }
    close();
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "저장 실패", "오류");
  } finally {
    saving.value = false;
  }
}

async function remove(t: Team) {
  if (!confirm(`'${t.name}' 팀을 삭제하시겠습니까? 소속 직원 ${t.member_count}명은 팀에서 해제됩니다.`)) return;
  try {
    await api.delete(`/v1/teams/${t.id}`);
    toast.success("팀 삭제됨", "🗑️");
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message ?? "삭제 실패", "오류");
  }
}

function swatch(h: number) {
  return `hsl(${h} 70% 50%)`;
}

// Color presets for the picker — covers the common care-home segmentations.
const HUE_PRESETS = [0, 30, 60, 120, 180, 210, 260, 300];
</script>

<template>
  <div class="px-8 py-6 max-w-4xl mx-auto">
    <header class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">팀 관리</h1>
        <p class="text-sm text-muted-foreground mt-1">
          센터 내 팀 (예: 주간팀 · 야간팀 · 1층팀)을 만들고 직원을 배정합니다.
        </p>
      </div>
      <button
        v-if="allowed"
        type="button"
        class="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90"
        @click="openCreate"
      >
        <Plus class="h-4 w-4" />
        새 팀
      </button>
    </header>

    <div v-if="!allowed" class="rounded-xl border bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 p-4 text-sm">
      이 페이지는 센터장 또는 본부 사용자만 접근할 수 있습니다.
    </div>

    <template v-else>
      <!-- Composer -->
      <div v-if="creating || editing" class="rounded-xl border bg-card p-5 mb-5 space-y-3">
        <div class="flex items-center gap-2">
          <Pencil class="h-4 w-4 text-primary" />
          <h2 class="font-semibold">{{ editing ? `'${editing.name}' 팀 수정` : "새 팀 만들기" }}</h2>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold block mb-1">팀 이름</label>
            <input
              v-model="formName"
              type="text"
              class="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:border-primary"
              placeholder="예: 주간팀, 1층팀"
              :disabled="saving"
            />
          </div>
          <div>
            <label class="text-xs font-semibold block mb-1">정렬 순서</label>
            <input
              v-model.number="formSort"
              type="number"
              class="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:border-primary"
              :disabled="saving"
            />
          </div>
          <div>
            <label class="text-xs font-semibold block mb-1">근무 시작 시각 (24h)</label>
            <input
              v-model="formStart"
              type="time"
              class="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:border-primary"
              :disabled="saving"
            />
          </div>
          <div>
            <label class="text-xs font-semibold block mb-1">근무 종료 시각 (24h)</label>
            <input
              v-model="formEnd"
              type="time"
              class="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:border-primary"
              :disabled="saving"
            />
          </div>
        </div>
        <p class="text-[11px] text-muted-foreground -mt-1">
          야간팀은 종료 시각이 다음 날로 넘어가도 됩니다 (예: 18:00 ~ 06:00).
        </p>
        <div>
          <label class="text-xs font-semibold block mb-1">팀 색상</label>
          <div class="flex items-center gap-2 flex-wrap">
            <button
              v-for="h in HUE_PRESETS" :key="h"
              type="button"
              class="h-8 w-8 rounded-full border-2 transition-all"
              :class="formHue === h ? 'border-foreground scale-110' : 'border-transparent hover:border-muted-foreground'"
              :style="{ backgroundColor: swatch(h) }"
              @click="formHue = h"
              :title="`hue ${h}`"
            />
            <input
              v-model.number="formHue"
              type="range"
              min="0" max="360"
              class="flex-1 min-w-[120px] ml-2"
              :disabled="saving"
            />
            <span class="font-mono text-xs tabular-nums w-10">{{ formHue }}</span>
          </div>
          <div class="mt-2 inline-flex items-center gap-2 text-sm">
            <span class="h-5 w-5 rounded-md" :style="{ backgroundColor: swatch(formHue) }" />
            <span class="font-semibold">{{ formName || "(미리보기)" }}</span>
          </div>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 h-10 rounded-md border border-input bg-background text-sm hover:bg-muted"
            :disabled="saving"
            @click="close"
          >취소</button>
          <button
            type="button"
            class="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
            :disabled="saving || !formName.trim()"
            @click="save"
          >
            <Loader2 v-if="saving" class="h-4 w-4 animate-spin" />
            저장
          </button>
        </div>
      </div>

      <!-- List -->
      <div class="rounded-xl border bg-card overflow-hidden">
        <div v-if="(teams?.length ?? 0) === 0" class="py-12 text-center text-sm text-muted-foreground">
          등록된 팀이 없습니다. 위의 '새 팀' 버튼으로 추가하세요.
        </div>
        <ul v-else class="divide-y">
          <li v-for="t in teams!" :key="t.id" class="px-5 py-3 flex items-center gap-3 hover:bg-muted/30">
            <span class="h-10 w-10 rounded-lg flex items-center justify-center text-white font-semibold shrink-0" :style="{ backgroundColor: swatch(t.color_hue) }">
              {{ t.name.charAt(0) }}
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold flex items-center gap-2 flex-wrap">
                <span>{{ t.name }}</span>
                <span class="text-[10px] font-medium tabular-nums bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                  {{ t.shift_start_hm }} ~ {{ t.shift_end_hm }}
                </span>
              </div>
              <div class="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                <Users class="h-3 w-3" />
                {{ t.member_count }}명 · {{ t.branch_name ?? "—" }}
              </div>
            </div>
            <button
              type="button"
              class="h-9 w-9 rounded-md border border-input bg-background inline-flex items-center justify-center hover:bg-muted"
              :title="`'${t.name}' 수정`"
              @click="openEdit(t)"
            >
              <Pencil class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="h-9 w-9 rounded-md border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-200 inline-flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-950/50"
              :title="`'${t.name}' 삭제`"
              @click="remove(t)"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </li>
        </ul>
      </div>

      <p class="text-xs text-muted-foreground mt-3 leading-relaxed">
        직원의 팀 배정은 <NuxtLink to="/staff" class="text-primary underline">직원 관리</NuxtLink> 페이지에서 각 직원 행의 팀 드롭다운으로 할 수 있습니다.
      </p>
    </template>
  </div>
</template>
