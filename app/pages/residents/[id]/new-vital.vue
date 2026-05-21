<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";

const route = useRoute();
const id = route.params.id as string;
const api = useApi();
const router = useRouter();

const hr = ref<number | null>(null);
const bpSys = ref<number | null>(null);
const bpDia = ref<number | null>(null);
const spo2 = ref<number | null>(null);
const tempC = ref<number | null>(null);
const note = ref("");
const submitting = ref(false);
const error = ref<string | null>(null);

async function postOne(kind: string, value: number | null) {
  if (value === null || Number.isNaN(value)) return;
  await api.post("/v1/vitals", {
    resident_id: id,
    kind,
    value,
    note: note.value || null,
  });
}

async function onSubmit() {
  if (submitting.value) return;
  submitting.value = true;
  error.value = null;
  try {
    // server takes one kind per POST; fan out in parallel
    await Promise.all([
      postOne("heart_rate", hr.value),
      postOne("blood_pressure_systolic", bpSys.value),
      postOne("blood_pressure_diastolic", bpDia.value),
      postOne("spo2", spo2.value),
      postOne("temperature_celsius", tempC.value),
    ]);
    await router.push(`/residents/${id}`);
  } catch (err: any) {
    error.value = err?.data?.message ?? err?.statusMessage ?? "저장 실패";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="px-8 py-6 max-w-2xl">
    <NuxtLink
      :to="`/residents/${id}`"
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
    >
      <ArrowLeft class="h-4 w-4" />
      어르신 상세
    </NuxtLink>

    <Card title="활력징후 기록" description="범위를 벗어나면 자동으로 담당 지점장에게 텔레그램이 전송됩니다.">
      <form class="space-y-4" @submit.prevent="onSubmit">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="hr">심박수 (BPM)</Label>
            <Input id="hr" v-model.number="hr" type="number" placeholder="72" />
          </div>
          <div class="space-y-2">
            <Label for="spo2">SpO₂ (%)</Label>
            <Input id="spo2" v-model.number="spo2" type="number" placeholder="98" />
          </div>
          <div class="space-y-2">
            <Label for="sys">수축기 혈압</Label>
            <Input id="sys" v-model.number="bpSys" type="number" placeholder="120" />
          </div>
          <div class="space-y-2">
            <Label for="dia">이완기 혈압</Label>
            <Input id="dia" v-model.number="bpDia" type="number" placeholder="80" />
          </div>
          <div class="space-y-2 col-span-2">
            <Label for="temp">체온 (°C)</Label>
            <Input id="temp" v-model.number="tempC" type="number" placeholder="36.5" />
          </div>
        </div>

        <div class="space-y-2">
          <Label for="note">메모 (선택)</Label>
          <textarea
            id="note"
            v-model="note"
            rows="3"
            class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            placeholder="식후 1시간, 안색 양호 등"
          />
        </div>

        <div v-if="error" class="text-sm text-destructive bg-destructive/10 rounded-md p-3">
          {{ error }}
        </div>

        <div class="flex gap-2">
          <Button type="submit" :disabled="submitting">
            {{ submitting ? "저장 중..." : "저장" }}
          </Button>
          <Button type="button" variant="outline" @click="router.back()">취소</Button>
        </div>
      </form>
    </Card>
  </div>
</template>
