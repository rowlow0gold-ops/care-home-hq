<script setup lang="ts">
/**
 * /tablet/residents/[id] — single resident's action menu.
 *
 * Big tiles for the 4 caregiver tasks plus a header with the resident's
 * vitals at a glance (last reading) so the caregiver can decide what to do.
 */
import { HeartPulse, ClipboardCheck, Pill, Camera, MapPin } from "@lucide/vue";

definePageMeta({ layout: "tablet" });

interface ResidentDetail {
  resident: {
    id: string; full_name: string; sex: "male" | "female";
    birth_date: string | null; care_grade: string | null;
    room_number: string | null; admitted_on: string | null;
  };
  contacts: Array<{ id: string; full_name: string; relationship: string | null; phone: string | null }>;
}

const route  = useRoute();
const api    = useTabletApi();
const router = useRouter();

const id = computed(() => String(route.params.id));

const { data, pending } = await useAsyncData(`tablet-resident-${id.value}`, () =>
  api.get<ResidentDetail>(`/v1/residents/${id.value}`),
);

useHead({ title: () => `${data.value?.resident.full_name ?? ""} · 케어닥` });

const tiles = computed(() => [
  { to: `/tablet/residents/${id.value}/vitals`,      icon: HeartPulse,     label: "활력 측정", tone: "bg-rose-500" },
  { to: `/tablet/residents/${id.value}/care-log`,    icon: ClipboardCheck, label: "케어 기록", tone: "bg-blue-500" },
  { to: `/tablet/residents/${id.value}/medications`, icon: Pill,           label: "투약 기록", tone: "bg-violet-500" },
  { to: `/tablet/residents/${id.value}/photo`,       icon: Camera,         label: "사진 업로드", tone: "bg-amber-500" },
]);

function ageOf(birth: string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth); if (isNaN(b.valueOf())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-5 py-6">
    <div v-if="pending" class="py-12 text-center text-muted-foreground">불러오는 중…</div>
    <template v-else-if="data">
      <div class="rounded-2xl border bg-card p-5 mb-5 flex items-center gap-4">
        <div
          class="h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold shrink-0"
          :class="data.resident.sex === 'female'
            ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-200'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'"
        >
          {{ data.resident.full_name.charAt(0) }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-2xl font-bold">{{ data.resident.full_name }}</div>
          <div class="text-sm text-muted-foreground mt-1 flex flex-wrap gap-2">
            <span v-if="ageOf(data.resident.birth_date) !== null">만 {{ ageOf(data.resident.birth_date) }}세</span>
            <span v-if="data.resident.care_grade">{{ data.resident.care_grade }}</span>
            <span v-if="data.resident.room_number" class="inline-flex items-center gap-0.5">
              <MapPin class="h-3 w-3" />{{ data.resident.room_number }}호
            </span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <NuxtLink
          v-for="t in tiles" :key="t.to"
          :to="t.to"
          class="block rounded-2xl border bg-card hover:shadow-lg hover:-translate-y-0.5 transition-all p-5"
        >
          <div
            class="h-14 w-14 rounded-2xl flex items-center justify-center text-white shadow-sm mb-3"
            :class="t.tone"
          >
            <component :is="t.icon" class="h-7 w-7" />
          </div>
          <div class="text-lg font-bold">{{ t.label }}</div>
        </NuxtLink>
      </div>

      <div v-if="data.contacts.length > 0" class="mt-6 rounded-xl border bg-card p-4">
        <h3 class="text-sm font-semibold mb-2 text-muted-foreground">보호자</h3>
        <ul class="space-y-1.5 text-sm">
          <li v-for="c in data.contacts" :key="c.id" class="flex justify-between gap-2">
            <span>{{ c.full_name }} <span class="text-muted-foreground">· {{ c.relationship ?? "—" }}</span></span>
            <a v-if="c.phone" :href="`tel:${c.phone}`" class="text-primary font-medium">{{ c.phone }}</a>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
