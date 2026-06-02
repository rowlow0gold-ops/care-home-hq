<script setup lang="ts">
/**
 * Layout for /tablet/* routes. Built for older caregivers on a tablet:
 *  - large fonts (base 18px), big tap targets (min 56px)
 *  - dark/light auto from system; no theme toggle to keep things simple
 *  - top bar shows my name + branch, with logout
 *  - BOTTOM NAV: 5 sections (대시보드 / 어르신 / 인수인계 / 출퇴근 / 더보기)
 *
 * Login + pair pages render full-screen with no chrome via isAuthScreen.
 */
import { LogOut, ChevronLeft, LayoutGrid, Users, ClipboardCheck, Clock, Menu, MessageSquare } from "@lucide/vue";

// Tablet-only PWA manifest + Apple meta so "홈 화면에 추가" creates a
// full-screen icon launcher pointing at /tablet.
useHead({
  link: [
    { rel: "manifest",          href: "/tablet-manifest.json" },
    { rel: "apple-touch-icon",  href: "/icons/tablet-192.png" },
  ],
  meta: [
    { name: "apple-mobile-web-app-capable",          content: "yes" },
    { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    { name: "apple-mobile-web-app-title",            content: "케어닥" },
    { name: "viewport",                              content: "width=device-width, initial-scale=1, viewport-fit=cover" },
  ],
});

const route   = useRoute();
const router  = useRouter();
const { me, logout } = useTablet();

// Chat polling kicks in for the whole tablet session — invites get
// auto-accepted in the background, and the unread badge on the nav stays
// live even if the user never opens /tablet/chat.
const chat = useChat();
onMounted(() => chat.startPolling());
const chatUnread = chat.totalUnread;

const isAuthScreen = computed(() => route.path === "/tablet/pair" || route.path === "/tablet/login");
const showBack     = computed(() => route.path !== "/tablet" && !isAuthScreen.value);

async function onLogout() {
  if (!confirm("로그아웃 하시겠습니까?")) return;
  await logout();
}

// Bottom nav — visible on all non-auth tablet screens.
const navItems = [
  { to: "/tablet",           label: "대시보드",   icon: LayoutGrid,      match: /^\/tablet$|^\/tablet\/(announcements|leave-info)/ },
  { to: "/tablet/residents", label: "어르신",     icon: Users,           match: /^\/tablet\/residents/ },
  { to: "/tablet/handover",  label: "인수인계",   icon: ClipboardCheck,  match: /^\/tablet\/handover/ },
  { to: "/tablet/chat",      label: "채팅",       icon: MessageSquare,   match: /^\/tablet\/chat/ },
  { to: "/tablet/more",      label: "더보기",     icon: Menu,            match: /^\/tablet\/(more|leave|schedule|clock)/ },
];
function navActive(re: RegExp) { return re.test(route.path); }
</script>

<template>
  <div class="min-h-screen bg-background text-foreground tablet-root">
    <header
      v-if="!isAuthScreen"
      class="sticky top-0 z-30 bg-card border-b shadow-sm flex items-center gap-3 px-5 h-16"
    >
      <button
        v-if="showBack"
        type="button"
        class="h-12 w-12 -ml-2 rounded-lg hover:bg-muted inline-flex items-center justify-center text-foreground"
        aria-label="뒤로"
        @click="router.back()"
      >
        <ChevronLeft class="h-6 w-6" />
      </button>
      <div class="flex-1 min-w-0">
        <div class="text-base font-semibold truncate">
          {{ me?.name ?? "" }}
          <span class="text-muted-foreground font-normal ml-1.5 text-sm">
            {{ me?.branch_name ?? "" }}
          </span>
        </div>
      </div>
      <button
        type="button"
        class="h-12 px-4 rounded-lg border border-input bg-card text-sm font-medium inline-flex items-center gap-1.5 hover:bg-muted"
        @click="onLogout"
      >
        <LogOut class="h-4 w-4" />
        로그아웃
      </button>
    </header>

    <main :class="!isAuthScreen ? 'pb-24' : ''">
      <slot />
    </main>

    <!-- Bottom nav (hidden on auth screens) -->
    <nav
      v-if="!isAuthScreen"
      class="fixed bottom-0 inset-x-0 z-40 bg-card border-t flex items-stretch shadow-[0_-1px_4px_rgba(0,0,0,0.06)]"
      style="padding-bottom: env(safe-area-inset-bottom);"
    >
      <NuxtLink
        v-for="n in navItems" :key="n.to"
        :to="n.to"
        class="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors relative"
        :class="navActive(n.match)
          ? 'text-primary bg-primary/5'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'"
      >
        <div class="relative">
          <component :is="n.icon" class="h-5 w-5" />
          <span
            v-if="n.to === '/tablet/chat' && chatUnread > 0"
            class="absolute -top-1.5 -right-2 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold inline-flex items-center justify-center leading-none"
          >
            {{ chatUnread > 99 ? '99+' : chatUnread }}
          </span>
        </div>
        {{ n.label }}
      </NuxtLink>
    </nav>
  </div>
</template>

<style scoped>
/* Bumps the base font for the entire tablet area so labels stay readable
   at arm's length for older caregivers. */
.tablet-root {
  font-size: 18px;
}
.tablet-root :deep(button),
.tablet-root :deep(input),
.tablet-root :deep(select),
.tablet-root :deep(textarea) {
  font-size: 17px;
}
</style>
