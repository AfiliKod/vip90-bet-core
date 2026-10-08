#!/bin/sh
# Git hook'larını kurar: node scripts/install-hooks.sh değil, sh scripts/install-hooks.sh
# (ya da ./scripts/install-hooks.sh). Worktree'ler aynı hook'u paylaşır.
HOOKS_DIR="$(git rev-parse --git-common-dir)/hooks"
mkdir -p "$HOOKS_DIR"

cat > "$HOOKS_DIR/pre-push" << 'HOOK'
#!/bin/sh
# 1) main'e doğrudan push yasak — PR ile girilir.
# 2) Push edilen her dal CHANGELOG kontrolünden geçer (scripts/check-changelog.mjs).
ROOT="$(git rev-parse --show-toplevel)"
ZERO=0000000000000000000000000000000000000000
while read local_ref local_sha remote_ref remote_sha; do
  if echo "$remote_ref" | grep -q "^refs/heads/main$"; then
    echo "❌ main branch'e direkt push yasak."
    echo "   Dal açıp main'e PR aç (bkz. docs/CHANGELOG_GUIDE.md)."
    exit 1
  fi
  [ "$local_sha" = "$ZERO" ] && continue            # dal silme
  case "$remote_ref" in refs/heads/*) ;; *) continue ;; esac   # etiketler vb.
  if [ -f "$ROOT/scripts/check-changelog.mjs" ]; then
    node "$ROOT/scripts/check-changelog.mjs" --base origin/main --head "$local_sha" || exit 1
  fi
done
exit 0
HOOK

chmod +x "$HOOKS_DIR/pre-push"
echo "✅ Git hook'ları kuruldu ($HOOKS_DIR/pre-push)."
