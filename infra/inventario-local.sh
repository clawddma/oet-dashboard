#!/usr/bin/env bash
# ==========================================================================
# inventario-local.sh — Fotografía SOLO-LECTURA del Mac mini.
# No modifica, no borra, no reinicia. Solo mira y reporta.
#
#   bash infra/inventario-local.sh > ~/inventario.txt
#   (luego pega el contenido de ~/inventario.txt en el chat)
# ==========================================================================
echo "════════ INVENTARIO LOCAL · $(date '+%Y-%m-%d %H:%M') ════════"
echo "host: $(hostname) · usuario: $(whoami)"

echo
echo "════════ 1. PROYECTOS GIT — trabajo sin guardar ════════"
find "$HOME" -maxdepth 5 -type d -name .git -not -path '*/node_modules/*' \
     -not -path '*/venv/*' -not -path '*/Library/*' 2>/dev/null | while read g; do
  p=$(dirname "$g")
  sin=$(git -C "$p" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  br=$(git -C "$p" rev-parse --abbrev-ref HEAD 2>/dev/null)
  ult=$(git -C "$p" log -1 --format='%ad' --date=short 2>/dev/null)
  unp=$(git -C "$p" log --oneline @{u}.. 2>/dev/null | wc -l | tr -d ' ')
  flag=""
  [ "$sin" != "0" ] && flag="  ⚠️ $sin SIN COMMITEAR"
  [ "$unp" != "0" ] && [ "$unp" != "" ] && flag="$flag  ⚠️ $unp SIN PUSHEAR"
  echo "  ${p/#$HOME/\~}"
  echo "      rama:$br  último commit:$ult$flag"
done

echo
echo "════════ 2. SKILLS LOCALES ════════"
for d in "$HOME/.claude/skills"/*/ "$HOME/.claude/skills/synced"/*/; do
  [ -f "$d/SKILL.md" ] || continue
  echo "  $(basename $d): $(wc -c <"$d/SKILL.md" | tr -d ' ') chars · modificado $(date -r "$d/SKILL.md" '+%Y-%m-%d' 2>/dev/null)"
done 2>/dev/null | sort -u

echo
echo "════════ 3. SERVICIOS Y AUTOMATIZACIÓN ════════"
echo "-- LaunchAgents --"
ls -1 "$HOME/Library/LaunchAgents"/*.plist 2>/dev/null | sed 's|.*/|  |' || echo "  (ninguno)"
echo "-- cron --"
crontab -l 2>/dev/null | grep -v '^#' | sed 's/^/  /' || echo "  (vacío)"
echo "-- puertos escuchando --"
lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print "  "$1" :"$9}' | sort -u | head -25

echo
echo "════════ 4. CLOUDFLARE ════════"
grep -E 'hostname|service' "$HOME/.cloudflared/config.yml" 2>/dev/null | sed 's/^/  /' || echo "  (sin config.yml)"

echo
echo "════════ 5. MCP DEL CLI ════════"
claude mcp list 2>/dev/null | sed 's/^/  /' || echo "  (no disponible)"

echo
echo "════════ 6. CARPETAS DE TRABAJO NO-GIT ════════"
for d in "$HOME/Guapa" "$HOME/.openclaw" "$HOME/.aster-bot" "$HOME/braindma"; do
  [ -d "$d" ] && echo "  ${d/#$HOME/\~}: $(du -sh "$d" 2>/dev/null | cut -f1) · $(find "$d" -type f 2>/dev/null | wc -l | tr -d ' ') archivos · tocado $(date -r "$d" '+%Y-%m-%d')"
done
echo
echo "════════ FIN ════════"
