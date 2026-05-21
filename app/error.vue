<script setup lang="ts">
import { Home, AlertTriangle } from "lucide-vue-next";

interface NuxtError {
  statusCode: number;
  statusMessage?: string;
  message?: string;
}
defineProps<{ error: NuxtError }>();

function go() {
  return clearError({ redirect: "/" });
}

useHead({ title: "오류 · 케어닥 HQ" });
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 bg-background">
    <div class="text-center max-w-md">
      <div class="h-16 w-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-6">
        <AlertTriangle class="h-8 w-8" />
      </div>
      <h1 class="text-5xl font-bold tracking-tight">{{ error.statusCode }}</h1>
      <p class="text-lg font-medium mt-3">
        {{ error.statusCode === 404 ? "페이지를 찾을 수 없습니다." : "오류가 발생했습니다." }}
      </p>
      <p class="text-sm text-muted-foreground mt-2">
        {{ error.statusMessage ?? error.message ?? "요청하신 페이지가 없거나 이동되었습니다." }}
      </p>
      <Button class="mt-6" @click="go">
        <Home class="h-4 w-4" />
        대시보드로 돌아가기
      </Button>
    </div>
  </div>
</template>
