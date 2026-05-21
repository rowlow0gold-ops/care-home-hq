<script setup lang="ts">
import { Heart } from "lucide-vue-next";

definePageMeta({ layout: "auth" });

const { login } = useAuth();
const route = useRoute();

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
    // login() already navigates to /, honor ?redirect= if present
    const redirect = (route.query.redirect as string | undefined) ?? null;
    if (redirect) {
      await navigateTo(redirect);
    }
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
  <Card class="w-full max-w-md">
    <template #header>
      <div class="flex items-center gap-3 mb-2">
        <div class="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
          <Heart class="h-5 w-5" />
        </div>
        <div>
          <h1 class="text-xl font-bold">케어닥 HQ</h1>
          <p class="text-sm text-muted-foreground">요양원 본부 통합관리</p>
        </div>
      </div>
    </template>

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

      <div v-if="error" class="text-sm text-destructive bg-destructive/10 rounded-md p-3">
        {{ error }}
      </div>

      <Button type="submit" class="w-full" :disabled="submitting">
        {{ submitting ? "로그인 중..." : "로그인" }}
      </Button>
    </form>

    <template #footer>
      <p class="text-xs text-muted-foreground">
        본부/지점장 계정만 접속 가능합니다. 요양보호사는 태블릿 앱을 사용하세요.
      </p>
    </template>
  </Card>
</template>
