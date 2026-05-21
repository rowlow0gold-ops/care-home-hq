<script setup lang="ts">
import { Pill } from "lucide-vue-next";

useHead({ title: "투약 · 케어닥 HQ" });

interface Resident {
  id: string;
  full_name: string;
  room_number: string | null;
}
interface Medication {
  id: string;
  resident_id: string;
  name: string;
  dosage: string;
  frequency: string;
  route: string | null;
  start_date: string;
  end_date: string | null;
  prescriber: string | null;
  instructions: string | null;
  stopped_at: string | null;
}

const api = useApi();

const { data: residents } = await useAsyncData("med-residents", () =>
  api.get<Resident[]>("/v1/residents"),
);

const { data: rawMeds, pending } = await useAsyncData("meds-all", async () => {
  const rs = residents.value ?? [];
  const results = await Promise.all(
    rs.map((r) =>
      api
        .get<Medication[]>(`/v1/residents/${r.id}/medications`)
        .then((meds) =>
          meds.map((m) => ({
            ...m,
            _residentName: r.full_name,
            _room: r.room_number,
          })),
        )
        .catch(() => []),
    ),
  );
  return results.flat();
});

const showStopped = ref(false);
const filtered = computed(() => {
  let rows = (rawMeds.value ?? []) as Array<
    Medication & { _residentName: string; _room: string | null }
  >;
  if (!showStopped.value) rows = rows.filter((m) => !m.stopped_at);
  return rows.sort((a, b) =>
    a._residentName.localeCompare(b._residentName, "ko"),
  );
});

const grouped = computed(() => {
  const out: Record<string, typeof filtered.value> = {};
  for (const m of filtered.value) {
    (out[m._residentName] ??= []).push(m);
  }
  return Object.entries(out);
});
</script>

<template>
  <div class="px-8 py-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold">투약 관리</h1>
      <p class="text-sm text-muted-foreground">
        어르신별 현재 투약 처방. 중단된 항목 토글로 이력 확인 가능.
      </p>
    </header>

    <div class="flex items-center gap-3 mb-4">
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input v-model="showStopped" type="checkbox" class="rounded border-input">
        중단된 처방 포함
      </label>
      <div class="ml-auto text-xs text-muted-foreground">
        {{ filtered.length }}건 / {{ residents?.length ?? 0 }}명
      </div>
    </div>

    <div v-if="pending" class="text-sm text-muted-foreground py-8 text-center">
      불러오는 중…
    </div>
    <div v-else-if="grouped.length === 0" class="py-12 text-center text-sm text-muted-foreground">
      처방된 약물이 없습니다.
    </div>

    <div v-else class="space-y-4">
      <Card v-for="[residentName, meds] in grouped" :key="residentName">
        <div class="flex items-center gap-2 mb-3 pb-3 border-b">
          <Pill class="h-4 w-4 text-primary" />
          <h3 class="font-semibold">{{ residentName }}</h3>
          <span v-if="meds[0]?._room" class="text-xs text-muted-foreground">
            · {{ meds[0]._room }}호
          </span>
        </div>

        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground border-b">
              <th class="py-2 pr-3 font-medium">약품명</th>
              <th class="py-2 pr-3 font-medium">용량</th>
              <th class="py-2 pr-3 font-medium">횟수</th>
              <th class="py-2 pr-3 font-medium">경로</th>
              <th class="py-2 pr-3 font-medium">처방의</th>
              <th class="py-2 font-medium">기간</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="m in meds"
              :key="m.id"
              class="border-b last:border-0"
              :class="m.stopped_at ? 'text-muted-foreground line-through' : ''"
            >
              <td class="py-2 pr-3 font-medium">{{ m.name }}</td>
              <td class="py-2 pr-3">{{ m.dosage }}</td>
              <td class="py-2 pr-3">{{ m.frequency }}</td>
              <td class="py-2 pr-3">{{ m.route ?? "—" }}</td>
              <td class="py-2 pr-3">{{ m.prescriber ?? "—" }}</td>
              <td class="py-2 text-xs">
                {{ m.start_date }}
                <template v-if="m.end_date"> ~ {{ m.end_date }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  </div>
</template>
