<script setup lang="ts">
/**
 * Public landing page (/) — marketing surface for unsigned-in visitors.
 *
 * Logged-in managers never see this — the global auth middleware bounces
 * them to /dashboard. Caregivers/nurses to /tablet.
 */
import {
  Heart, ChevronRight, Building2, Users, Calendar, ClipboardList,
  Send, Receipt, Bell, ShieldCheck, MessageSquare, Sparkles,
  Smartphone, BarChart3,
} from "@lucide/vue";

definePageMeta({ layout: false });
useHead({
  title: "케어닥 — 작은 요양원도 본사처럼 운영합니다",
  meta: [
    { name: "description",
      content: "요양·주간·방문 통합 SaaS. 다지점 본사·거점·위성센터를 한 화면에서 관리하고, 직원 스케쥴·어르신 케어·가족 알림·청구까지 한 번에 처리합니다." },
  ],
});

// Marketing copy lives entirely in template — keep this script minimal.
const features = [
  { icon: BarChart3,    title: "본사 대시보드",
    body: "전 지점 매출·어르신 현원·사고 신호를 한눈에. 월별·연도별·지점별 필터로 회의 1분 전에 답을 꺼냅니다." },
  { icon: Calendar,     title: "2주 자동 스케쥴러",
    body: "북미식 4조 2교대 규칙(휴무 보장·주말 로테이션)을 한 번 클릭하면 14일치 근무가 자동으로 발행됩니다." },
  { icon: ClipboardList, title: "어르신 케어 기록",
    body: "케어 로그·활력·투약을 태블릿 한 손에. 사고 신호는 본사 KPI에 즉시 반영." },
  { icon: Send,         title: "가족 알림 자동화",
    body: "정기 사진·이벤트별 알림을 텔레그램으로. 폴백 큐·재시도·자동 만료까지 운영 가능한 메시지 인프라." },
  { icon: Receipt,      title: "장기요양 청구",
    body: "월별 청구 런·완료 상태·내보내기까지. 5일 마감 다음날 매출이 대시보드에 잡힙니다." },
  { icon: MessageSquare, title: "행정 ↔ 요양보호사 채팅",
    body: "휴가 반려 사유를 채팅으로 바로 협의. 한글 초성 검색 + 자동 수락으로 누구나 1초만에 대화 시작." },
];

const stats = [
  { v: "1,300+", k: "관리 직원" },
  { v: "12",     k: "전국 지점 운영" },
  { v: "480",   k: "어르신 케어" },
  { v: "1:10",   k: "법정 인력 매칭" },
];

const surfaces = [
  { icon: BarChart3,  title: "본사·센터장 HQ 웹",
    body: "다지점 대시보드, 직원/어르신/스케쥴 관리, 청구·보고서." },
  { icon: Smartphone, title: "요양보호사 태블릿 PWA",
    body: "출퇴근·인수인계·케어 기록·휴가·채팅. 홈 화면에 추가하면 앱처럼 동작." },
  { icon: Sparkles,   title: "데스크톱 (Tauri)",
    body: "센터 접수·행정용 네이티브 데스크톱. 채팅·스케쥴 발행 등 무거운 작업을 빠르게." },
];
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <!-- ── Top bar ────────────────────────────────────────────────── -->
    <header class="sticky top-0 z-30 backdrop-blur bg-background/80 border-b">
      <div class="max-w-6xl mx-auto px-5 h-16 flex items-center gap-3">
        <NuxtLink to="/" class="flex items-center gap-2.5 mr-auto">
          <div class="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Heart class="h-5 w-5" />
          </div>
          <div>
            <div class="text-base font-bold leading-tight">케어닥</div>
            <div class="text-[10px] text-muted-foreground tracking-wide">통합 요양 운영 SaaS</div>
          </div>
        </NuxtLink>
        <a href="#features" class="hidden sm:inline text-sm text-muted-foreground hover:text-foreground">기능</a>
        <a href="#surfaces" class="hidden sm:inline text-sm text-muted-foreground hover:text-foreground">제품</a>
        <a href="#contact"  class="hidden sm:inline text-sm text-muted-foreground hover:text-foreground">문의</a>
        <NuxtLink
          to="/login"
          class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90"
        >로그인 <ChevronRight class="h-4 w-4" /></NuxtLink>
      </div>
    </header>

    <!-- ── Hero ───────────────────────────────────────────────────── -->
    <section class="relative overflow-hidden">
      <div
        aria-hidden="true"
        class="absolute inset-0 -z-10 opacity-40 dark:opacity-25"
        style="
          background-image:
            radial-gradient(circle at 22% 24%, hsl(var(--primary) / 0.22) 0px, transparent 42%),
            radial-gradient(circle at 78% 76%, hsl(var(--primary) / 0.14) 0px, transparent 48%);"
      />
      <div class="max-w-6xl mx-auto px-5 pt-20 pb-24 grid lg:grid-cols-12 gap-10 items-center">
        <div class="lg:col-span-7">
          <div class="inline-flex items-center gap-1.5 text-xs font-semibold text-primary mb-4 px-2.5 py-1 rounded-full bg-primary/10">
            <Sparkles class="h-3.5 w-3.5" />
            요양·주간·방문 통합
          </div>
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
            작은 요양원도<br />
            <span class="text-primary">본사처럼</span> 운영합니다.
          </h1>
          <p class="mt-5 text-lg text-muted-foreground max-w-xl leading-relaxed">
            다지점 본사·거점·위성센터를 한 화면에서. 직원 스케쥴·어르신 케어·가족 알림·장기요양 청구까지 한 번에 처리합니다.
          </p>
          <div class="mt-7 flex flex-wrap gap-3">
            <NuxtLink
              to="/login"
              class="h-12 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 hover:bg-primary/90 shadow-sm shadow-primary/20"
            >데모 로그인 <ChevronRight class="h-4 w-4" /></NuxtLink>
            <a
              href="#features"
              class="h-12 px-6 rounded-xl border border-input bg-card text-sm font-semibold inline-flex items-center gap-2 hover:bg-muted/40"
            >기능 둘러보기</a>
          </div>
          <p class="mt-4 text-xs text-muted-foreground">
            <ShieldCheck class="inline h-3.5 w-3.5 mr-1" />
            테넌트별 RLS로 데이터 격리 · GitHub Actions CI/CD · 자체 호스팅 가능
          </p>
        </div>

        <!-- Mock dashboard preview -->
        <div class="lg:col-span-5">
          <div class="rounded-2xl border bg-card shadow-2xl overflow-hidden">
            <div class="h-9 bg-muted/40 border-b flex items-center px-3 gap-1.5">
              <span class="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span class="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span class="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span class="ml-3 text-[10px] text-muted-foreground">care.minhojan-world.site / dashboard</span>
            </div>
            <div class="p-5 space-y-4">
              <div class="rounded-xl bg-primary/10 p-4 flex items-center justify-between">
                <div>
                  <div class="text-[11px] text-muted-foreground">2026년 5월 청구 매출</div>
                  <div class="text-2xl font-bold mt-1 tabular-nums">₩2,481,300,000</div>
                </div>
                <div class="h-10 w-10 rounded-lg bg-primary/15 text-primary inline-flex items-center justify-center">
                  <Receipt class="h-5 w-5" />
                </div>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div class="rounded-lg border p-3">
                  <div class="text-[10px] text-muted-foreground">사고 신호</div>
                  <div class="text-lg font-bold mt-0.5 tabular-nums">3</div>
                </div>
                <div class="rounded-lg border p-3">
                  <div class="text-[10px] text-muted-foreground">어르신</div>
                  <div class="text-lg font-bold mt-0.5 tabular-nums">480</div>
                </div>
                <div class="rounded-lg border p-3">
                  <div class="text-[10px] text-muted-foreground">재직 직원</div>
                  <div class="text-lg font-bold mt-0.5 tabular-nums">1,297</div>
                </div>
              </div>
              <div class="rounded-lg border">
                <div class="px-3 py-2 border-b text-[11px] text-muted-foreground">지점별 현황</div>
                <div v-for="b in ['서울광역센터 · Hub','부산광역센터 · Hub','대구 사상센터 · Sat']" :key="b"
                     class="px-3 py-2 border-b last:border-b-0 flex items-center text-xs">
                  <Building2 class="h-3.5 w-3.5 text-primary mr-1.5" />
                  <span class="font-medium">{{ b }}</span>
                  <span class="ml-auto tabular-nums text-muted-foreground">₩XXX,XXX,XXX</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Stats strip ─────────────────────────────────────────────── -->
    <section class="border-y bg-muted/30">
      <div class="max-w-6xl mx-auto px-5 py-10 grid grid-cols-2 sm:grid-cols-4 gap-6">
        <div v-for="s in stats" :key="s.k" class="text-center">
          <div class="text-3xl sm:text-4xl font-bold tabular-nums text-foreground">{{ s.v }}</div>
          <div class="text-xs text-muted-foreground mt-1">{{ s.k }}</div>
        </div>
      </div>
    </section>

    <!-- ── Features ────────────────────────────────────────────────── -->
    <section id="features" class="max-w-6xl mx-auto px-5 py-20">
      <div class="text-center max-w-2xl mx-auto mb-12">
        <div class="text-xs font-semibold text-primary tracking-wide mb-2">기능</div>
        <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">하나의 화면에서 끝납니다.</h2>
        <p class="text-muted-foreground mt-3">
          본사 회계·센터장 운영·요양보호사 현장 — 같은 데이터 한 번에. 별도 엑셀 합치기 없이.
        </p>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="f in features" :key="f.title"
          class="rounded-2xl border bg-card p-5 hover:border-primary/40 hover:-translate-y-0.5 transition-all"
        >
          <div class="h-10 w-10 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center mb-3">
            <component :is="f.icon" class="h-5 w-5" />
          </div>
          <div class="text-base font-semibold">{{ f.title }}</div>
          <p class="text-sm text-muted-foreground mt-1.5 leading-relaxed">{{ f.body }}</p>
        </div>
      </div>
    </section>

    <!-- ── Surfaces (HQ / Tablet / Desktop) ────────────────────────── -->
    <section id="surfaces" class="bg-muted/30 border-y">
      <div class="max-w-6xl mx-auto px-5 py-20">
        <div class="text-center max-w-2xl mx-auto mb-12">
          <div class="text-xs font-semibold text-primary tracking-wide mb-2">제품</div>
          <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">현장마다 맞춤 인터페이스.</h2>
          <p class="text-muted-foreground mt-3">
            본사 직원·센터장·현장 요양보호사가 각자 일 잘 하는 화면을 가집니다.
          </p>
        </div>
        <div class="grid sm:grid-cols-3 gap-4">
          <div v-for="s in surfaces" :key="s.title" class="rounded-2xl border bg-card p-6">
            <div class="h-12 w-12 rounded-xl bg-primary/10 text-primary inline-flex items-center justify-center mb-4">
              <component :is="s.icon" class="h-6 w-6" />
            </div>
            <div class="text-base font-semibold">{{ s.title }}</div>
            <p class="text-sm text-muted-foreground mt-2 leading-relaxed">{{ s.body }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── CTA ─────────────────────────────────────────────────────── -->
    <section id="contact" class="max-w-4xl mx-auto px-5 py-20 text-center">
      <Bell class="h-8 w-8 mx-auto text-primary mb-4" />
      <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">바로 사용해보세요.</h2>
      <p class="text-muted-foreground mt-3">
        본사 데모 계정으로 로그인하면 전국 12개 지점의 운영 데이터를 그대로 둘러볼 수 있습니다.
      </p>
      <div class="mt-7 flex justify-center gap-3 flex-wrap">
        <NuxtLink
          to="/login"
          class="h-12 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 hover:bg-primary/90"
        >데모 로그인 <ChevronRight class="h-4 w-4" /></NuxtLink>
        <a
          href="mailto:hello@minhojan-world.site"
          class="h-12 px-6 rounded-xl border border-input bg-card text-sm font-semibold inline-flex items-center gap-2 hover:bg-muted/40"
        >도입 문의</a>
      </div>
      <p class="text-[11px] text-muted-foreground mt-4">
        데모 계정: <code class="px-1.5 py-0.5 rounded bg-muted text-foreground">hq@demo.com</code> /
        <code class="px-1.5 py-0.5 rounded bg-muted text-foreground">admin1234</code>
      </p>
    </section>

    <!-- ── Footer ──────────────────────────────────────────────────── -->
    <footer class="border-t">
      <div class="max-w-6xl mx-auto px-5 py-8 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        <div class="flex items-center gap-2 mr-auto">
          <div class="h-7 w-7 rounded-md bg-primary text-primary-foreground inline-flex items-center justify-center">
            <Heart class="h-4 w-4" />
          </div>
          <span class="font-semibold text-foreground">케어닥</span>
          <span>© 2026 minhojan-world</span>
        </div>
        <a href="#features" class="hover:text-foreground">기능</a>
        <a href="#surfaces" class="hover:text-foreground">제품</a>
        <a href="#contact"  class="hover:text-foreground">문의</a>
        <NuxtLink to="/login" class="hover:text-foreground">로그인</NuxtLink>
      </div>
    </footer>
  </div>
</template>
