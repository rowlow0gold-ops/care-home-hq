/**
 * Returns the branch_id that should pre-fill any "지점" filter for the
 * currently logged-in user.
 *
 *   - 센터장 (branch_manager) with a branch_id  → their own branch
 *   - 본사 / 슈퍼관리자 / 기타                  → ""  (전체 지점)
 *
 * Returned as a plain string (not a ref) so callers can use it as
 * `ref(useDefaultBranch())` and still update it freely afterward.
 */
export function useDefaultBranch(): string {
  const { me } = useAuth();
  const u = me.value;
  if (u?.role === "branch_manager" && u.branch_id) return u.branch_id;
  return "";
}
