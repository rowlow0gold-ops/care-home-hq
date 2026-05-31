<script setup lang="ts">
/**
 * /tablet/pair — one-time device pairing.
 *
 * Branch manager generates an 8-character code on the HQ side
 * (POST /devices/pair-code, valid 15 min, single-use), then walks over to
 * the tablet and types the code here. On success, the device_token is
 * stored in a 1-year httpOnly cookie and we send the caregiver on to PIN
 * login.
 */
import { Loader2, KeyRound, Tablet, CheckCircle2, AlertCircle } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "태블릿 등록 · 케어닥" });

const { claim } = useTablet();
const router    = useRouter();

const code  = ref("");
const label = ref("");

const submitting = ref(false);
const error      = ref<string | null>(null);
const success    = ref<{ branch_name: string } | null>(null);

// Suggest a default label based on the UA — caregiver can override.
onMounted(() => {
  if (!label.value && import.meta.client) {
    const ua = navigator.userAgent;
    const hint = /iPad/i.test(ua) ? "iPad" : /SM-T/i.test(ua) ? "Galaxy Tab" : "Tablet";
    label.value = `${hint} · ${new Date().toLocaleDateString("ko-KR")}`;
  }
});

async function submit() {
  if (submitting.value) return;
  if (code.value.trim().length < 4) {
    error.value = "페어링 코드를 입력해주세요.";
    return;
  }
  submitting.value = true;
  error.value = null;
  try {
    const res = await claim(code.value.trim().toUpperCase(), label.value.trim() || "Tablet");
    success.value = { branch_name: res.branch_name };
    setTimeout(() => router.push("/tablet/login"), 1200);
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? e?.message ?? "코드를 확인해주세요.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-primary/5 to-background">
    <div class="w-full max-w-md bg-card border rounded-2xl shadow-lg p-7">
      <div class="text-center mb-6">
        <div class="mx-auto h-16 w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-3">
          <Tablet class="h-8 w-8" />
        </div>
        <h1 class="text-2xl font-bold">태블릿 등록</h1>
        <p class="text-sm text-muted-foreground mt-2">
          센터장님이 알려주신 페어링 코드를 입력하세요.
        </p>
      </div>

      <form class="space-y-4" @submit.prevent="submit">
        <div>
          <label class="text-sm font-semibold block mb-1.5 text-foreground">페어링 코드 (8자리)</label>
          <input
            v-model="code"
            type="text"
            autocomplete="off"
            autocapitalize="characters"
            inputmode="text"
            class="w-full h-14 px-4 rounded-xl border border-input bg-background text-2xl font-mono tracking-widest text-center uppercase focus:outline-none focus:border-primary"
            placeholder="ABCD1234"
            :disabled="submitting || !!success"
            @input="code = code.toUpperCase()"
          />
        </div>

        <div>
          <label class="text-sm font-semibold block mb-1.5 text-foreground">태블릿 이름</label>
          <input
            v-model="label"
            type="text"
            class="w-full h-12 px-4 rounded-xl border border-input bg-background text-base focus:outline-none focus:border-primary"
            placeholder="예: 김간호사 iPad"
            :disabled="submitting || !!success"
          />
          <p class="text-xs text-muted-foreground mt-1">센터장님이 어떤 태블릿인지 알아볼 수 있게 설정해주세요.</p>
        </div>

        <div v-if="error" class="rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 p-3 text-sm inline-flex items-start gap-2">
          <AlertCircle class="h-5 w-5 shrink-0 mt-0.5" />
          <span>{{ error }}</span>
        </div>

        <div v-if="success" class="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 p-3 text-sm inline-flex items-start gap-2">
          <CheckCircle2 class="h-5 w-5 shrink-0 mt-0.5" />
          <span>등록 완료! <b>{{ success.branch_name }}</b> 에 연결되었습니다. PIN 로그인으로 이동합니다…</span>
        </div>

        <button
          type="submit"
          class="w-full h-14 rounded-xl bg-primary text-primary-foreground text-base font-semibold inline-flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60"
          :disabled="submitting || !!success"
        >
          <Loader2 v-if="submitting" class="h-5 w-5 animate-spin" />
          <KeyRound v-else class="h-5 w-5" />
          등록하기
        </button>
      </form>

      <p class="text-xs text-muted-foreground text-center mt-6 leading-relaxed">
        한 번 등록하면 같은 태블릿에서는 PIN만으로 로그인할 수 있습니다.
      </p>
    </div>
  </div>
</template>
