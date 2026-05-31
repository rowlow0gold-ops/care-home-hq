<script setup lang="ts">
import { Heart, LogIn, Mail, Lock, Eye, EyeOff, Loader2, Building2, Shield, Copy, Search } from "@lucide/vue";

definePageMeta({ layout: "auth" });

const { login } = useAuth();
const route = useRoute();
const toast = useToast();

// Pre-filled for dev convenience — matches seeded demo accounts.
// Remove these before any real production deploy.
const email = ref("hq@demo.com");
const password = ref("admin1234");
const showPwd = ref(false);
const error = ref<string | null>(null);
const submitting = ref(false);

// Demo accounts seeded in the DB. All share password "admin1234".
const hqAccount = { email: "hq@demo.com", label: "본사 관리자", icon: Shield };

// Web admin is for HQ + Hub managers only. Satellite (Sat) center managers
// access a different interface, so their accounts are intentionally not
// listed here as demo logins. Matches the 5-metro-hub regional reseed.
const branches = [
  { slug: "seoul-hub",   name: "서울광역센터", email: "manager.seoul-hub@demo.com",   type: "hub" as const },
  { slug: "busan-hub",   name: "부산광역센터", email: "manager.busan-hub@demo.com",   type: "hub" as const },
  { slug: "daejeon-hub", name: "대전광역센터", email: "manager.daejeon-hub@demo.com", type: "hub" as const },
  { slug: "daegu-hub",   name: "대구광역센터", email: "manager.daegu-hub@demo.com",   type: "hub" as const },
  { slug: "gwangju-hub", name: "광주광역센터", email: "manager.gwangju-hub@demo.com", type: "hub" as const },
];

const branchQuery = ref("");
const filteredBranches = computed(() => {
  const q = branchQuery.value.trim().toLowerCase();
  if (!q) return branches;
  return branches.filter(
    (b) => b.name.toLowerCase().includes(q) || b.email.toLowerCase().includes(q),
  );
});

function pick(account: { email: string }) {
  email.value = account.email;
  password.value = "admin1234";
}

function copyEmail(e: Event, addr: string) {
  e.stopPropagation();
  navigator.clipboard.writeText(addr);
  toast.success("이메일이 복사되었습니다", addr);
}

async function onSubmit() {
  if (submitting.value) return;
  error.value = null;
  submitting.value = true;
  try {
    await login(email.value, password.value);
    toast.success("로그인 성공", "환영합니다");
    // Always navigate after a successful login. Honor ?redirect=… if present
    // (the auth middleware sets it when bouncing an unauthenticated request),
    // otherwise land on the dashboard.
    const redirect = (route.query.redirect as string | undefined) ?? "/";
    await navigateTo(redirect);
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
  <div class="w-full max-w-4xl flex flex-col items-center gap-6">
    <!-- Brand mark -->
    <div class="flex flex-col items-center">
      <div class="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center shadow-xl shadow-primary/25 mb-4 ring-1 ring-primary/20">
        <Heart class="h-8 w-8" />
      </div>
      <h1 class="text-2xl font-bold tracking-tight">케어닥 HQ</h1>
      <p class="text-sm text-muted-foreground mt-1">요양원 본부 통합관리</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-[420px_1fr] gap-4 w-full">
      <!-- LOGIN FORM -->
      <div class="rounded-2xl border bg-card/95 backdrop-blur-md shadow-xl shadow-foreground/5 p-7">
        <h2 class="text-lg font-semibold mb-1">로그인</h2>
        <p class="text-sm text-muted-foreground mb-6">계정 정보를 입력해 주세요.</p>

        <form class="space-y-4" @submit.prevent="onSubmit">
          <div class="space-y-1.5">
            <label for="email" class="text-xs font-medium text-foreground/70 tracking-wide uppercase">이메일</label>
            <div class="relative group">
              <Mail class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                id="email"
                v-model="email"
                type="email"
                autocomplete="username"
                placeholder="name@example.com"
                required
                class="w-full h-11 pl-10 pr-3 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground/60 transition-all focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
            </div>
          </div>

          <div class="space-y-1.5">
            <label for="password" class="text-xs font-medium text-foreground/70 tracking-wide uppercase">비밀번호</label>
            <div class="relative group">
              <Lock class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                id="password"
                v-model="password"
                :type="showPwd ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="••••••••"
                required
                class="w-full h-11 pl-10 pr-11 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground/60 transition-all focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
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

          <Transition
            enter-active-class="transition duration-150"
            enter-from-class="opacity-0 -translate-y-1"
            leave-active-class="transition duration-100"
            leave-to-class="opacity-0"
          >
            <div v-if="error" class="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <span class="text-base leading-none mt-0.5">⚠</span>
              <span class="flex-1">{{ error }}</span>
            </div>
          </Transition>

          <button
            type="submit"
            :disabled="submitting"
            class="w-full h-11 rounded-lg bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:bg-primary"
          >
            <Loader2 v-if="submitting" class="h-4 w-4 animate-spin" />
            <LogIn v-else class="h-4 w-4" />
            {{ submitting ? "로그인 중..." : "로그인" }}
          </button>
        </form>
      </div>

      <!-- DEMO ACCOUNTS PANEL -->
      <div class="rounded-2xl border bg-card/95 backdrop-blur-md shadow-xl shadow-foreground/5 p-5">
        <div class="flex items-baseline justify-between mb-3">
          <h3 class="text-sm font-semibold">데모 계정</h3>
          <span class="text-xs text-muted-foreground">비밀번호: <span class="font-mono font-medium text-foreground">admin1234</span></span>
        </div>

        <!-- HQ account -->
        <div class="relative mb-2 group">
          <button
            type="button"
            class="w-full flex items-center gap-3 px-3 py-2.5 pr-11 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
            @click="pick(hqAccount)"
          >
            <div class="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
              <Shield class="h-4 w-4" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium">{{ hqAccount.label }}</div>
              <div class="text-xs text-muted-foreground font-mono truncate">{{ hqAccount.email }}</div>
            </div>
          </button>
          <button
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity h-7 w-7 rounded flex items-center justify-center hover:bg-foreground/10"
            :aria-label="`${hqAccount.email} 복사`"
            @click="copyEmail($event, hqAccount.email)"
          >
            <Copy class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Divider + search -->
        <div class="flex items-center justify-between mt-4 mb-2 px-1 gap-2">
          <span class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase whitespace-nowrap">
            센터장 ({{ filteredBranches.length }}/{{ branches.length }})
          </span>
          <div class="relative flex-1 max-w-[180px]">
            <Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              v-model="branchQuery"
              type="search"
              placeholder="센터/이메일 검색"
              class="w-full h-7 pl-6 pr-2 rounded-md border border-input bg-background text-[11px] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
          </div>
        </div>

        <!-- Branch managers list — scrollable, single column to stay readable
             even with hundreds of centers. Fixed height so the panel doesn't
             jump as the filter narrows results. -->
        <div class="h-[280px] overflow-y-auto pr-1 border-t border-b py-1.5">
          <div v-if="filteredBranches.length === 0" class="text-center text-xs text-muted-foreground py-6">
            검색 결과가 없습니다.
          </div>
          <div v-else class="flex flex-col gap-1">
            <div v-for="b in filteredBranches" :key="b.slug" class="relative group">
              <button
                type="button"
                class="w-full flex items-center gap-2.5 px-2.5 py-2 pr-9 rounded-md border border-transparent hover:bg-muted hover:border-border transition-colors text-left"
                @click="pick({ email: b.email })"
              >
                <div
                  class="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                  :class="b.type === 'hub'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'"
                >
                  <Building2 class="h-3.5 w-3.5" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="text-sm font-medium truncate">{{ b.name }}</span>
                    <span
                      class="text-[9px] font-semibold uppercase tracking-wider rounded px-1 py-px flex-shrink-0"
                      :class="b.type === 'hub'
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground'"
                    >
                      {{ b.type === 'hub' ? 'Hub' : 'Sat' }}
                    </span>
                  </div>
                  <div class="text-[11px] text-muted-foreground font-mono truncate">{{ b.email }}</div>
                </div>
              </button>
              <button
                type="button"
                class="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity h-6 w-6 rounded flex items-center justify-center hover:bg-foreground/10"
                :aria-label="`${b.email} 복사`"
                @click="copyEmail($event, b.email)"
              >
                <Copy class="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        <p class="text-[11px] text-muted-foreground mt-4 leading-relaxed">
          위 계정 중 하나를 눌러 폼에 자동으로 입력하세요.<br>
          요양보호사 (간호사 포함) 계정은 태블릿 앱 PIN 로그인을 사용합니다.
        </p>
        <NuxtLink
          to="/tablet/pair"
          class="mt-3 inline-flex items-center justify-center w-full h-10 rounded-md border border-input bg-background hover:bg-muted text-xs font-medium text-muted-foreground"
        >
          요양보호사용 태블릿 등록 / PIN 로그인 →
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
