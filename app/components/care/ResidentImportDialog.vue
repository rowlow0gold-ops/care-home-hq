<script setup lang="ts">
/**
 * 어르신 일괄 가져오기 (XLSX) — two-step modal:
 *   1) File picker → POST /v1/residents/import (mode=validate, multipart)
 *      → server returns { total_rows, valid_rows, inserted=0, errors[] }
 *      → user sees the preview ('총 N행 / 유효 M행 / 오류 K건')
 *   2) User clicks 등록 → POST again with mode=commit → server inserts and
 *      returns { inserted, errors[] }. Toast on success, refresh list.
 *
 * HQ-only — backend rejects others with 403.
 */
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Loader2 } from "@lucide/vue";

interface ImportError { row: number; message: string }
interface ImportResult {
  total_rows: number;
  valid_rows: number;
  inserted:   number;
  errors:     ImportError[];
}

const props = defineProps<{
  open: boolean;
  /** HQ users must pick a target branch (default: caller's, which HQ doesn't have) */
  branchId?: string | null;
}>();
const emit = defineEmits<{
  "update:open": [v: boolean];
  imported:    [];   // fires after a successful commit so parent can refresh
}>();

const file       = ref<File | null>(null);
const preview    = ref<ImportResult | null>(null);
const validating = ref(false);
const committing = ref(false);

const toast = useToast();

function reset() {
  file.value = null;
  preview.value = null;
  validating.value = false;
  committing.value = false;
}
function close() {
  reset();
  emit("update:open", false);
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  file.value = input.files?.[0] ?? null;
  preview.value = null;
}

async function postImport(mode: "validate" | "commit"): Promise<ImportResult | null> {
  if (!file.value) return null;
  const fd = new FormData();
  fd.append("file", file.value);
  fd.append("mode", mode);
  if (props.branchId) fd.append("branch_id", props.branchId);
  try {
    const res = await $fetch<ImportResult>("/api/v1/residents/import", {
      method: "POST",
      body:   fd,
      credentials: "include",
    });
    return res;
  } catch (e: any) {
    const msg = e?.data?.message ?? e?.statusMessage ?? e?.message ?? "업로드 실패";
    toast.error(msg, mode === "validate" ? "검증 실패" : "등록 실패");
    return null;
  }
}

async function onValidate() {
  if (!file.value) return;
  validating.value = true;
  preview.value = await postImport("validate");
  validating.value = false;
}

async function onCommit() {
  if (!file.value || !preview.value || preview.value.valid_rows === 0) return;
  committing.value = true;
  const r = await postImport("commit");
  committing.value = false;
  if (r) {
    toast.success(`${r.inserted}명이 등록되었습니다`);
    emit("imported");
    close();
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[110] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="close"
    >
      <div
        class="bg-card text-foreground rounded-xl shadow-2xl border max-w-xl w-full max-h-[85vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        <div class="px-5 py-4 border-b flex items-center gap-2">
          <FileSpreadsheet class="h-4 w-4 text-primary" />
          <h2 class="text-base font-semibold flex-1">어르신 일괄 등록 (XLSX)</h2>
          <button
            type="button"
            class="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
            aria-label="닫기"
            @click="close"
          ><X class="h-4 w-4" /></button>
        </div>

        <div class="p-5 space-y-4">
          <div class="text-xs text-muted-foreground space-y-1">
            <p>· 엑셀(.xlsx) 첫 번째 시트, 첫 행은 헤더여야 합니다.</p>
            <p>· 헤더 순서: <strong>이름</strong> · <strong>성별</strong> · <strong>생년월일</strong> · <strong>등급</strong> · <strong>호실</strong> · <strong>입소일</strong></p>
            <p>· 성별: 여/남/기타, 등급: 1~5 또는 인지지원(빈칸 허용)</p>
            <p>· 한 번에 최대 <strong>200행</strong>까지 업로드할 수 있습니다.</p>
            <p>· 양식이 필요하면 먼저 <strong>내보내기</strong>로 현재 명단을 다운로드해 보세요.</p>
          </div>

          <label class="block">
            <span class="block text-xs font-medium mb-1">엑셀 파일</span>
            <input
              type="file"
              accept=".xlsx,.xlsm,.xls"
              class="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              @change="onFileChange"
            >
          </label>

          <!-- Preview -->
          <div v-if="preview" class="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div class="grid grid-cols-3 gap-2 text-center">
              <div>
                <div class="text-xs text-muted-foreground">총 행</div>
                <div class="text-2xl font-bold tabular-nums">{{ preview.total_rows }}</div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground">등록 가능</div>
                <div class="text-2xl font-bold tabular-nums text-primary">{{ preview.valid_rows }}</div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground">오류</div>
                <div class="text-2xl font-bold tabular-nums" :class="preview.errors.length > 0 ? 'text-destructive' : 'text-muted-foreground'">{{ preview.errors.length }}</div>
              </div>
            </div>

            <div v-if="preview.errors.length > 0" class="border-t pt-3">
              <div class="text-xs font-semibold text-destructive mb-2 flex items-center gap-1">
                <AlertCircle class="h-3.5 w-3.5" />
                오류 ({{ preview.errors.length }}건)
              </div>
              <ul class="text-xs space-y-1 max-h-40 overflow-y-auto">
                <li v-for="err in preview.errors" :key="`${err.row}-${err.message}`" class="font-mono">
                  <span class="text-muted-foreground">{{ err.row }}행</span> · {{ err.message }}
                </li>
              </ul>
              <p class="text-[11px] text-muted-foreground mt-2">
                오류 행은 등록되지 않습니다. 등록 가능한 {{ preview.valid_rows }}행만 진행됩니다.
              </p>
            </div>

            <div v-else class="border-t pt-3 text-xs text-primary flex items-center gap-1">
              <CheckCircle2 class="h-3.5 w-3.5" />
              모든 행이 유효합니다.
            </div>
          </div>
        </div>

        <div class="px-5 py-3 border-t flex items-center justify-end gap-2 bg-muted/20">
          <button
            type="button"
            class="h-10 px-4 rounded-lg border border-input bg-background text-sm hover:bg-muted"
            @click="close"
          >취소</button>
          <button
            v-if="!preview"
            type="button"
            class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
            :disabled="!file || validating"
            @click="onValidate"
          >
            <Loader2 v-if="validating" class="h-4 w-4 animate-spin" />
            <Upload v-else class="h-4 w-4" />
            검증
          </button>
          <button
            v-else
            type="button"
            class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
            :disabled="committing || preview.valid_rows === 0"
            @click="onCommit"
          >
            <Loader2 v-if="committing" class="h-4 w-4 animate-spin" />
            <CheckCircle2 v-else class="h-4 w-4" />
            {{ preview.valid_rows }}건 등록
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
