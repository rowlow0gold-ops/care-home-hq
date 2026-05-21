<script setup lang="ts">
import { Camera, Check, Image, Search, X } from "@lucide/vue";

useHead({ title: "사진 승인 · 케어닥 HQ" });

interface PhotoSummary {
  id: string;
  resident_id: string;
  resident_name: string;
  branch_id: string;
  branch_name: string;
  taken_by_name: string;
  taken_at: string;
  caption: string | null;
  status: string;
  data_url: string;
}

interface Branch { id: string; name: string }

const api = useApi();
const toast = useToast();

const tab = ref<"pending" | "approved" | "rejected">("pending");
const branchFilter = ref<string>("");
const q = ref("");
const debouncedQ = refDebounced(q, 250);
const decideNote = ref("");
const selected = ref<PhotoSummary | null>(null);
const acting = ref<string | null>(null);

const { data: dashboard } = await useAsyncData(
  "photos-branches",
  () => api.get<{ branches: Branch[] }>("/v1/dashboard/summary"),
);

const { data: photos, pending, refresh } = await useAsyncData(
  "photos-list",
  () => api.get<PhotoSummary[]>(`/v1/photos/pending?status=${tab.value}`),
  { watch: [tab] },
);

const counts = ref<{ pending: number; approved: number; rejected: number }>({
  pending: 0, approved: 0, rejected: 0,
});

async function loadCounts() {
  try {
    const [p, a, r] = await Promise.all([
      api.get<PhotoSummary[]>(`/v1/photos/pending?status=pending`),
      api.get<PhotoSummary[]>(`/v1/photos/pending?status=approved`),
      api.get<PhotoSummary[]>(`/v1/photos/pending?status=rejected`),
    ]);
    counts.value = { pending: p.length, approved: a.length, rejected: r.length };
  } catch {/* ignore */}
}
await loadCounts();

const filtered = computed(() => {
  let rows = photos.value ?? [];
  if (branchFilter.value) rows = rows.filter((r) => r.branch_id === branchFilter.value);
  if (debouncedQ.value) {
    const n = debouncedQ.value.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.resident_name.toLowerCase().includes(n) ||
        r.taken_by_name.toLowerCase().includes(n) ||
        (r.caption ?? "").toLowerCase().includes(n),
    );
  }
  return rows;
});

async function decide(p: PhotoSummary, status: "approved" | "rejected") {
  if (acting.value) return;
  acting.value = p.id;
  try {
    await api.patch(`/v1/photos/${p.id}/decide`, {
      status,
      note: decideNote.value || null,
    });
    toast.success(status === "approved" ? "승인되어 가족에게 전송됩니다" : "반려되었습니다");
    selected.value = null;
    decideNote.value = "";
    await refresh();
    await loadCounts();
  } catch (e: any) {
    toast.error(e?.message ?? "처리에 실패했습니다");
  } finally {
    acting.value = null;
  }
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
</script>

<template>
  <div class="px-8 py-6 max-w-7xl mx-auto">
    <header class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Camera class="w-7 h-7 text-pink-500" /> 사진 승인
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          요양보호사가 촬영한 어르신 사진을 검토하고, 승인 시 텔레그램으로 가족에게 전송됩니다.
        </p>
      </div>
    </header>

    <!-- tabs -->
    <div class="flex items-center gap-1 mb-4 border-b">
      <button
        v-for="t in (['pending','approved','rejected'] as const)"
        :key="t"
        @click="tab = t"
        :class="[
          'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition',
          tab === t
            ? 'border-pink-500 text-pink-600 dark:text-pink-400'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        ]"
      >
        {{ t === "pending" ? "승인 대기" : t === "approved" ? "승인됨" : "반려됨" }}
        <span class="ml-1 inline-flex items-center justify-center rounded-full bg-muted px-1.5 text-xs">
          {{ counts[t] }}
        </span>
      </button>
    </div>

    <!-- filters -->
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <div class="relative flex-1 min-w-[220px] max-w-sm">
        <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="q"
          type="text"
          placeholder="어르신/촬영자/메모 검색"
          class="w-full pl-9 pr-3 h-9 rounded-md border bg-background text-sm"
        />
      </div>
      <select
        v-model="branchFilter"
        class="h-9 px-3 rounded-md border bg-background text-sm"
      >
        <option value="">전체 지점</option>
        <option v-for="b in dashboard?.branches ?? []" :key="b.id" :value="b.id">
          {{ b.name }}
        </option>
      </select>
    </div>

    <!-- grid -->
    <div v-if="pending" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="i in 6" :key="i"
        class="aspect-[4/3] rounded-xl bg-muted animate-pulse"
      />
    </div>
    <div v-else-if="filtered.length === 0" class="rounded-xl border bg-card p-12 text-center text-muted-foreground">
      <Image class="w-10 h-10 mx-auto mb-2 opacity-40" />
      표시할 사진이 없습니다.
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <article
        v-for="p in filtered" :key="p.id"
        class="rounded-xl border bg-card overflow-hidden hover:shadow-md transition group"
      >
        <button
          @click="selected = p"
          class="block w-full aspect-[4/3] overflow-hidden bg-muted"
        >
          <img :src="p.data_url" :alt="p.caption ?? p.resident_name"
               class="w-full h-full object-cover group-hover:scale-[1.02] transition" />
        </button>
        <div class="p-3 space-y-1.5">
          <div class="flex items-center justify-between">
            <NuxtLink :to="`/residents/${p.resident_id}`" class="font-semibold text-sm hover:underline">
              {{ p.resident_name }}
            </NuxtLink>
            <span class="text-[11px] text-muted-foreground">{{ fmtTime(p.taken_at) }}</span>
          </div>
          <div class="text-xs text-muted-foreground">
            {{ p.branch_name }} · 촬영 {{ p.taken_by_name }}
          </div>
          <p v-if="p.caption" class="text-sm line-clamp-2">{{ p.caption }}</p>
          <div v-if="tab === 'pending'" class="flex gap-2 pt-2">
            <button
              :disabled="acting === p.id"
              @click.stop="decide(p, 'approved')"
              class="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-50"
            >
              <Check class="w-3.5 h-3.5" /> 승인
            </button>
            <button
              :disabled="acting === p.id"
              @click.stop="decide(p, 'rejected')"
              class="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-md border hover:bg-muted text-xs font-medium disabled:opacity-50"
            >
              <X class="w-3.5 h-3.5" /> 반려
            </button>
          </div>
        </div>
      </article>
    </div>

    <!-- detail modal -->
    <div
      v-if="selected"
      @click.self="selected = null"
      class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <div class="bg-card rounded-xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div class="flex items-start justify-between p-4 border-b">
          <div>
            <h2 class="text-lg font-semibold">{{ selected.resident_name }}</h2>
            <p class="text-xs text-muted-foreground">
              {{ selected.branch_name }} · 촬영 {{ selected.taken_by_name }} · {{ fmtTime(selected.taken_at) }}
            </p>
          </div>
          <button @click="selected = null" class="p-1 rounded hover:bg-muted">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="flex-1 overflow-auto bg-black flex items-center justify-center">
          <img :src="selected.data_url" :alt="selected.caption ?? ''" class="max-w-full max-h-[60vh] object-contain" />
        </div>
        <div class="p-4 border-t space-y-3">
          <p v-if="selected.caption" class="text-sm">{{ selected.caption }}</p>
          <textarea
            v-if="tab === 'pending'"
            v-model="decideNote"
            rows="2"
            placeholder="(선택) 검토 메모"
            class="w-full px-3 py-2 rounded-md border bg-background text-sm"
          />
          <div v-if="tab === 'pending'" class="flex gap-2">
            <button
              :disabled="acting === selected.id"
              @click="decide(selected, 'approved')"
              class="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50"
            >
              <Check class="w-4 h-4" /> 승인하고 가족에게 전송
            </button>
            <button
              :disabled="acting === selected.id"
              @click="decide(selected, 'rejected')"
              class="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-md border hover:bg-muted text-sm font-medium disabled:opacity-50"
            >
              <X class="w-4 h-4" /> 반려
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
