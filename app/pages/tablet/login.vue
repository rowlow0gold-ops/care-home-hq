<script setup lang="ts">
/**
 * /tablet/login — daily PIN login for a paired tablet.
 *
 * If email is remembered from a prior login, we show ONLY the PIN keypad
 * (with the email displayed as text). Tap "다른 계정" to clear and retype.
 * If no email is remembered (first time after pairing), show email field
 * first; once filled, focus drops to the keypad.
 */
import { Loader2, ArrowLeft, AlertCircle, KeyRound, Delete } from "@lucide/vue";

definePageMeta({ layout: "tablet" });
useHead({ title: "로그인 · 케어닥" });

const { pinLogin, rememberedEmail, forgetEmail } = useTablet();

// Demo defaults so the tester can tap straight through. The seeded
// `cg1.seoul-hub@demo.com` caregiver exists in the regional reseed; set
// their PIN once in /settings/tablet (matching DEFAULT_PIN below) and the
// 로그인 button will work on first tap.
const DEFAULT_EMAIL = "cg1.seoul-hub@demo.com";
const DEFAULT_PIN   = "1234";

const remembered = ref(rememberedEmail());
const email      = ref(remembered.value || DEFAULT_EMAIL);
const pin        = ref(remembered.value ? "" : DEFAULT_PIN);
const submitting = ref(false);
const error      = ref<string | null>(null);

watch(remembered, (v) => { email.value = v; });

const showEmailStep = computed(() => !remembered.value && pin.value.length === 0);

function tap(n: string) {
  if (pin.value.length >= 8) return;
  error.value = null;
  pin.value += n;
  if (pin.value.length >= 4 && remembered.value) {
    // Auto-submit when the standard 4 digits are in and we have an email.
    if (pin.value.length === 4) submit();
  }
}
function backspace() {
  pin.value = pin.value.slice(0, -1);
  error.value = null;
}
function clearAll() {
  pin.value = "";
  error.value = null;
}
function switchAccount() {
  forgetEmail();
  remembered.value = "";
  email.value = "";
  pin.value = "";
}

async function submit() {
  if (submitting.value) return;
  if (!email.value.trim()) {
    error.value = "이메일을 입력해주세요.";
    return;
  }
  if (pin.value.length < 4) {
    error.value = "PIN을 4자리 이상 입력해주세요.";
    return;
  }
  submitting.value = true;
  error.value = null;
  try {
    await pinLogin(email.value.trim(), pin.value);
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? "이메일 또는 PIN이 올바르지 않습니다.";
    pin.value = "";
  } finally {
    submitting.value = false;
  }
}

const KEYS: (string | "clear" | "back")[] = [
  "1","2","3",
  "4","5","6",
  "7","8","9",
  "clear","0","back",
];
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-primary/5 to-background">
    <div class="w-full max-w-md bg-card border rounded-2xl shadow-lg p-7">
      <div class="text-center mb-6">
        <div class="mx-auto h-16 w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-3">
          <KeyRound class="h-8 w-8" />
        </div>
        <h1 class="text-2xl font-bold">PIN 로그인</h1>
        <p v-if="remembered" class="text-sm text-muted-foreground mt-2 truncate">
          {{ remembered }}
        </p>
        <p v-else class="text-sm text-muted-foreground mt-2">
          이메일과 PIN을 입력해주세요.
        </p>
      </div>

      <div v-if="!remembered" class="mb-4">
        <label class="text-sm font-semibold block mb-1.5">이메일</label>
        <input
          v-model="email"
          type="email"
          autocomplete="username"
          inputmode="email"
          class="w-full h-14 px-4 rounded-xl border border-input bg-background text-base focus:outline-none focus:border-primary"
          placeholder="caregiver@example.com"
          :disabled="submitting"
        />
      </div>

      <!-- PIN dot indicator -->
      <div class="flex items-center justify-center gap-3 mb-5 h-12">
        <span
          v-for="i in 4" :key="i"
          class="h-4 w-4 rounded-full border-2"
          :class="pin.length >= i ? 'border-primary bg-primary' : 'border-muted-foreground/40'"
        />
        <span
          v-for="i in 4"
          :key="`extra-${i}`"
          v-show="pin.length > 4 && pin.length >= 4 + i"
          class="h-2.5 w-2.5 rounded-full bg-primary/70"
        />
      </div>

      <div v-if="error" class="rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 p-3 text-sm inline-flex items-start gap-2 mb-3 w-full">
        <AlertCircle class="h-5 w-5 shrink-0 mt-0.5" />
        <span>{{ error }}</span>
      </div>

      <!-- 3x4 numeric keypad -->
      <div class="grid grid-cols-3 gap-2.5">
        <template v-for="k in KEYS" :key="k">
          <button
            v-if="k === 'clear'"
            type="button"
            class="h-16 rounded-xl border border-input bg-card text-sm font-semibold text-muted-foreground hover:bg-muted active:scale-95 transition"
            :disabled="submitting"
            @click="clearAll"
          >
            지우기
          </button>
          <button
            v-else-if="k === 'back'"
            type="button"
            class="h-16 rounded-xl border border-input bg-card inline-flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-95 transition"
            :disabled="submitting"
            @click="backspace"
          >
            <Delete class="h-5 w-5" />
          </button>
          <button
            v-else
            type="button"
            class="h-16 rounded-xl bg-muted/40 hover:bg-muted text-2xl font-semibold active:scale-95 transition"
            :disabled="submitting"
            @click="tap(k)"
          >
            {{ k }}
          </button>
        </template>
      </div>

      <button
        v-if="!remembered || pin.length > 4"
        type="button"
        class="mt-5 w-full h-14 rounded-xl bg-primary text-primary-foreground text-base font-semibold inline-flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60"
        :disabled="submitting"
        @click="submit"
      >
        <Loader2 v-if="submitting" class="h-5 w-5 animate-spin" />
        <KeyRound v-else class="h-5 w-5" />
        로그인
      </button>

      <div class="mt-5 flex items-center justify-between text-sm">
        <button
          v-if="remembered"
          type="button"
          class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          @click="switchAccount"
        >
          <ArrowLeft class="h-4 w-4" />
          다른 계정으로 로그인
        </button>
        <NuxtLink to="/tablet/pair" class="text-muted-foreground hover:text-foreground ml-auto">
          태블릿 재등록
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
