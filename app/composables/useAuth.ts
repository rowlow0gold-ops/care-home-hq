interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: "caregiver" | "nurse" | "branch_manager" | "hq" | "super_admin";
    tenant_id: string;
    branch_id: string | null;
  };
}

const ROLE_RANK: Record<MeResponse["user"]["role"], number> = {
  caregiver: 1,
  nurse: 2,
  branch_manager: 3,
  hq: 4,
  super_admin: 5,
};

export function useAuth() {
  const me = useState<MeResponse["user"] | null>("auth.me", () => null);
  const router = useRouter();

  async function login(email: string, password: string) {
    await $fetch("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    await refresh();
    // Caregivers + nurses live entirely in the tablet program (/tablet/*);
    // managers go to the HQ dashboard. The HQ auth middleware enforces this
    // on every navigation too, in case a caregiver bookmarks /care directly.
    const role = me.value?.role;
    const dest = (role === "caregiver" || role === "nurse") ? "/tablet" : "/";
    await router.push(dest);
  }

  async function logout() {
    await $fetch("/api/auth/logout", { method: "POST" });
    me.value = null;
    await router.push("/login");
  }

  async function refresh() {
    try {
      const res = await $fetch<MeResponse>("/api/auth/me");
      me.value = res.user;
    } catch {
      me.value = null;
    }
  }

  function hasRole(min: MeResponse["user"]["role"]): boolean {
    if (!me.value) return false;
    return ROLE_RANK[me.value.role] >= ROLE_RANK[min];
  }

  return { me, login, logout, refresh, hasRole };
}
