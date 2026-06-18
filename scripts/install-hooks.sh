#!/bin/sh
HOOKS_DIR="$(git rev-parse --git-dir)/hooks"

cat > "$HOOKS_DIR/pre-push" << 'HOOK'
#!/bin/sh
while read local_ref local_sha remote_ref remote_sha; do
  if echo "$remote_ref" | grep -q "refs/heads/main"; then
    echo "❌ main branch'e direkt push yasak."
    echo "   dev → main için PR aç: https://github.com/AfiliKod/bet/compare/main...dev"
    exit 1
  fi
done
exit 0
HOOK

chmod +x "$HOOKS_DIR/pre-push"
echo "✅ Git hook'ları kuruldu."
