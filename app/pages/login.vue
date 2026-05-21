<script setup lang="ts">
import { Heart, LogIn } from "@lucide/vue";

definePageMeta({ layout: "auth" });

const { login } = useAuth();
const route = useRoute();
const toast = useToast();

const email = ref("manager@demo.com");
const password = ref("");
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
      "로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="w-full max-w-md">
    <!-- Brand mark above the card -->
    <div class="flex flex-col items-center mb-6">
      <div class="h-14 w-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 mb-3">
        <Heart class="h-7 w-7" />
      </div>
      <h1 class="text-2xl font-bold tracking-tight">케어닥 HQ</h1>
      <p class="text-sm text-muted-foreground mt-1">요양원 본부 통합관리</p>
    </div>

    <div class="rounded-xl border bg-card shadow-xl backdrop-blur-sm p-6">
      <form class="space-y-4" @submit.prevent="onSubmit">
        <div class="space-y-2">
          <Label for="email">이메일</Label>
          <Input
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            placeholder="manager@demo.com"
            required
          />
        </div>

        <div class="space-y-2">
          <Label for="password">비밀번호</Label>
          <Input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            required
          />
        </div>

        <Transition
          enter-active-class="transition duration-150"
          enter-from-class="opacity-0 -translate-y-1"
          leave-active-class="transition duration-100"
          leave-to-class="opacity-0"
        >
          <div
            v-if="error"
            class="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3"
          >
            {{ error }}
          </div>
        </Transition>

        <Button type="submit" class="w-full" :disabled="submitting">
          <LogIn class="h-4 w-4" />
          {{ submitting ? "로그인 중..." : "로그인" }}
        </Button>
      </form>
    </div>

    <p class="text-xs text-muted-foreground text-center mt-6 px-4">
      본부/지점장 계정만 접속 가능합니다.<br>
      요양보호사는 태블릿 앱을 사용하세요.
    </p>
  </div>
</template>
