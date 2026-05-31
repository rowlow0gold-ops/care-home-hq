<script setup lang="ts">
/**
 * /tablet/residents — branch-scoped list of active 어르신.
 *
 * Big tap cards (no table), search by name/room, group by 호실 floor.
 * Tap a card → /tablet/residents/[id] for the action menu.
 */
import { Search, User, MapPin } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "어르신 목록 · 케어닥" });

interface Resident {
  id: string;
  full_name: string;
  sex: "male" | "female";
  birth_date: string | null;
  care_grade: string | null;
  room_number: string | null;
  admitted_on: string | null;
  status: string;
}

const api = useTabletApi();
const router = useRouter();

const q = ref("");

const { data, pending, refresh } = await useAsyncData("tablet-residents", () =>
  api.get<Resident[]>("/v1/residents"),
);

const filtered = computed(() => {
  const list = data.value ?? [];
  const needle = q.value.trim().toLowerCase();
  if (!needle) return list;
  return list.filter((r) =>
    r.full_name.toLowerCase().includes(needle) ||
    (r.room_number ?? "").toLowerCase().includes(needle),
  );
});

function ageOf(birth: string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (isNaN(b.valueOf())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

function open(id: string) {
  router.push(`/tablet/residents/${id}`);
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-5 py-6">
    <h1 class="text-2xl font-bold mb-4">어르신 목록</h1>

    <div class="relative mb-5">
      <Search class="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
      <input
        v-model="q"
        type="text"
        class="w-full h-14 pl-12 pr-4 rounded-xl border border-input bg-background text-base focus:outline-none focus:border-primary"
        placeholder="이름 또는 호실로 검색"
      />
    </div>

    <div v-if="pending" class="py-12 text-center text-muted-foreground">불러오는 중…</div>
    <div v-else-if="filtered.length === 0" class="py-12 text-center text-muted-foreground">
      해당하는 어르신이 없습니다.
    </div>

    <ul v-else class="space-y-2.5">
      <li v-for="r in filtered" :key="r.id">
        <button
          type="button"
          class="w-full text-left rounded-xl border bg-card hover:shadow-md hover:bg-muted/30 active:scale-[0.99] transition p-4 flex items-center gap-4"
          @click="open(r.id)"
        >
          <div
            class="h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
            :class="r.sex === 'female'
              ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-200'
              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'"
          >
            {{ r.full_name.charAt(0) }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-lg font-semibold truncate">{{ r.full_name }}</div>
            <div class="text-sm text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <span v-if="ageOf(r.birth_date) !== null">만 {{ ageOf(r.birth_date) }}세</span>
              <span v-if="r.care_grade" class="rounded bg-muted px-1.5 py-0.5 text-xs">{{ r.care_grade }}</span>
              <span v-if="r.room_number" class="inline-flex items-center gap-0.5">
                <MapPin class="h-3 w-3" />{{ r.room_number }}
              </span>
            </div>
          </div>
          <User class="h-5 w-5 text-muted-foreground" />
        </button>
      </li>
    </ul>
  </div>
</template>
