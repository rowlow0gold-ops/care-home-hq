<script setup lang="ts">
import { Heart, LogIn, Mail, Lock, Eye, EyeOff, Loader2 } from "@lucide/vue";

definePageMeta({ layout: "auth" });

const { login } = useAuth();
const route = useRoute();
const toast = useToast();

const email = ref("manager@demo.com");
const password = ref("");
const showPwd = ref(false);
const error = ref<string | null>(null);
const submitting = ref(false);

async function onSubmit() {
  if (submitting.value) return;
  error.value = null;
  submitting.value = true;
  try {
    await login(email.value, password.value);
    toast.success("로그인 성공", "환영합니다");
    const redirect = (route.query.redirect as string | undefined) ?? null;
    if (redirect) await navigateTo(redirect);
  } catch (err: any) {
    error.value =
      err?.statusMessage ??
      err?.data?.message ??
      "이메일이나 비밀번호가 올바르지 않습니다.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="w-full max-w-md">
    <!-- Brand mark above the card -->
    <div class="flex flex-col items-center mb-8">
      <div class="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center shadow-xl shadow-primary/25 mb-4 ring-1 ring-primary/20">
        <Heart class="h-8 w-8" />
      </div>
      <h1 class="text-2xl font-bold tracking-tight">케어닥 HQ</h1>
      <p class="text-sm text-muted-foreground mt-1">요양원 본부 통합관리</p>
    </div>

    <div class="rounded-2xl border bg-card/95 backdrop-blur-md shadow-xl shadow-foreground/5 p-7">
      <h2 class="text-lg font-semibold mb-1">로그인</h2>
      <p class="text-sm text-muted-foreground mb-6">계정 정보를 입력해 주세요.</p>

      <form class="space-y-4" @submit.prevent="onSubmit">
        <!-- Email -->
        <div class="space-y-1.5">
          <label for="email" class="text-xs font-medium text-foreground/70 tracking-wide uppercase">
            이메일
          </label>
          <div class="relative group">
            <Mail
              class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors"
            />
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="username"
              placeholder="name@example.com"
              required
              class="w-full h-11 pl-10 pr-3 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground/60 transition-all
                     focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15
                     disabled:cursor-not-allowed disabled:opacity-50"
            >
          </div>
        </div>

        <!-- Password -->
        <div class="space-y-1.5">
          <label for="password" class="text-xs font-medium text-foreground/70 tracking-wide uppercase">
            비밀번호
          </label>
          <div class="relative group">
            <Lock
              class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors"
            />
            <input
              id="password"
              v-model="password"
              :type="showPwd ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="••••••••"
              required
              class="w-full h-11 pl-10 pr-11 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground/60 transition-all
                     focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15
                     disabled:cursor-not-allowed disabled:opacity-50"
            >
            <button
              type="button"
              tabindex="-1"
              class="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              :aria-label="showPwd ? '비밀번호 숨기기' : '비밀번호 보기'"
              @click="showPwd = !showPwd"
            >
              <EyeOff v-if="showPwd" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- Error -->
        <Transition
          enter-active-class="transition duration-150"
          enter-from-class="opacity-0 -translate-y-1"
          leave-active-class="transition duration-100"
          leave-to-class="opacity-0"
        >
          <div
            v-if="error"
            class="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 flex items-start gap-2"
          >
            <span class="text-base leading-none mt-0.5">⚠</span>
            <span class="flex-1">{{ error }}</span>
          </div>
        </Transition>

        <!-- Submit -->
        <button
          type="submit"
          :disabled="submitting"
          class="w-full h-11 rounded-lg bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 shadow-md shadow-primary/20 transition-all
                 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30
                 active:scale-[0.99]
                 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:bg-primary"
        >
          <Loader2 v-if="submitting" class="h-4 w-4 animate-spin" />
          <LogIn v-else class="h-4 w-4" />
          {{ submitting ? "로그인 중..." : "로그인" }}
        </button>
      </form>
    </div>

    <p class="text-xs text-muted-foreground text-center mt-6 px-4 leading-relaxed">
      본부/지점장 계정만 접속 가능합니다.<br>
      요양보호사는 <span class="font-medium text-foreground/70">태블릿 앱</span>을 사용하세요.
    </p>
  </div>
</template>
