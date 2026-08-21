#!/usr/bin/env bash
# ==========================================================================
# diagnostico-dominios.sh — Chequeo read-only de todos los dominios y
# servicios locales de Daniel Mesa (themesa.co / bellapop.co).
#
# NO reinicia nada, NO mata procesos. Solo mira y reporta.
# Correr en el Mac mini:  bash infra/diagnostico-dominios.sh
# ==========================================================================
set -uo pipefail

V=$'\e[32m'; R=$'\e[31m'; A=$'\e[33m'; G=$'\e[90m'; N=$'\e[0m'; B=$'\e[1m'

# host|puerto_local|proceso_esperado|descripcion
SERVICIOS=(
  "torque.themesa.co|8795|vitrina.js|TORQ · vitrina publica (showroom MAGE)"
  "torq.bellapop.co|8790|sala.js|TORQ · sala de pruebas del bot (con llave)"
  "torque.bellapop.co|8790|sala.js|TORQ · alias"
  "api.bellapop.co|8787|servidor.js|TORQ · webhook WhatsApp (Meta)"
  "aster.bellapop.co|8081|aster|Trading · webhook TradingView -> Aster DEX"
  "bots.bellapop.co|8092|dashboard_server.py|Trading · dashboard privado"
  "btc.themesa.co|8092|dashboard_server.py|Trading · sitio publico BTC"
  "mc.bellapop.co|18795|log_server.py|Mission Control (canvas)"
  "guapa.bellapop.co|||Guapa · dashboard B2B (FastAPI)"
  "oet.themesa.co|||OET · Panel 360"
  "oet.bellapop.co|||OET · Panel 360 (alias)"
  "fp.bellapop.co|||Finanzas personales"
  "mi.bellapop.co|||Mesa Infantino · familiar (Cloudflare Pages/Workers)"
  "jerseys.bellapop.co|||Jerseys (Cloudflare Pages/Workers)"
  "themesa.co|||Raiz themesa.co"
  "www.themesa.co|||Raiz themesa.co (www)"
  "bellapop.co|||Raiz bellapop.co"
  "www.bellapop.co|||Raiz bellapop.co (www)"
)

# ── Preflight: decir con claridad qué falta, en vez de reventar ──────────
FALTA=""
for t in curl pgrep; do command -v "$t" >/dev/null 2>&1 || FALTA="$FALTA $t"; done
if [ -n "$FALTA" ]; then
  echo "${R}Faltan herramientas requeridas:$FALTA${N}"; exit 1
fi
command -v lsof >/dev/null 2>&1 || echo "${A}!${N} Sin 'lsof': se omite el chequeo de puertos locales."
command -v dig  >/dev/null 2>&1 || echo "${G}(sin 'dig': se usa python3 para la DNS)${N}"
command -v python3 >/dev/null 2>&1 || command -v dig >/dev/null 2>&1 || {
  echo "${R}Se necesita 'dig' o 'python3' para resolver DNS.${N}"; exit 1; }

echo
echo "${B}════════ DIAGNOSTICO DE DOMINIOS · $(date '+%Y-%m-%d %H:%M:%S') ════════${N}"

# ── 1. cloudflared ────────────────────────────────────────────────────────
echo
echo "${B}1) TUNEL CLOUDFLARE${N}"
if pgrep -f "cloudflared" >/dev/null 2>&1; then
  echo "   ${V}●${N} cloudflared CORRIENDO (pid: $(pgrep -f cloudflared | tr '\n' ' '))"
  if pgrep -f "cloudflared.*tunnel --url" >/dev/null 2>&1; then
    echo "   ${A}!${N} Hay un tunel EFIMERO (--url) activo. Los named tunnels son los buenos."
  fi
else
  echo "   ${R}●${N} cloudflared NO ESTA CORRIENDO  ${R}<-- todo lo tunelizado esta caido${N}"
  echo "   ${G}arreglo: bash infra/instalar-launchagents.sh --aplicar${N}"
fi
[ -f "$HOME/.cloudflared/config.yml" ] \
  && echo "   ${G}config: ~/.cloudflared/config.yml${N}" \
  || echo "   ${A}!${N} No existe ~/.cloudflared/config.yml"

# ── 2. Puertos locales ────────────────────────────────────────────────────
echo
echo "${B}2) PROCESOS / PUERTOS LOCALES${N}"
for row in "${SERVICIOS[@]}"; do
  IFS='|' read -r host puerto proc desc <<<"$row"
  [ -z "$puerto" ] && continue
  command -v lsof >/dev/null 2>&1 || continue
  if lsof -nP -iTCP:"$puerto" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "   ${V}●${N} :$puerto  escuchando   ${G}($proc — $desc)${N}"
  else
    echo "   ${R}●${N} :$puerto  MUERTO       ${G}($proc — $desc)${N}"
  fi
done

# ── 3. DNS + HTTP ─────────────────────────────────────────────────────────
echo
echo "${B}3) DNS + HTTP POR DOMINIO${N}"
printf "   %-26s %-9s %-7s %s\n" "DOMINIO" "DNS" "HTTP" "NOTA"
printf "   %-26s %-9s %-7s %s\n" "──────────────────────────" "─────────" "───────" "────────────────────────"
for row in "${SERVICIOS[@]}"; do
  IFS='|' read -r host puerto proc desc <<<"$row"

  if command -v dig >/dev/null 2>&1; then
    ip=$(dig +short +time=3 +tries=1 "$host" A 2>/dev/null | grep -E '^[0-9]+\.' | head -1)
  else
    ip=$(python3 -c "import socket,sys
try: print(socket.getaddrinfo(sys.argv[1],None,socket.AF_INET)[0][4][0])
except Exception: pass" "$host" 2>/dev/null)
  fi

  if [ -z "$ip" ]; then
    printf "   %-26s ${R}%-9s${N} %-7s %s\n" "$host" "SIN DNS" "-" "$desc"
    continue
  fi

  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "https://$host/" 2>/dev/null)
  cerr=$?
  case "$code" in
    200|301|302|401|403) col=$V; nota="$desc" ;;
    502|503|504)         col=$R; nota="ORIGEN CAIDO — levanta el proceso local" ;;
    530)                 col=$R; nota="Error 1033/530 — tunel Cloudflare caido" ;;
    404)                 col=$A; nota="404 — host mal enrutado en Cloudflare" ;;
    000)                 col=$A; code="s/r"
                         nota="Sin respuesta (curl err $cerr) — red local, TLS o tunel caido" ;;
    *)                   col=$A; nota="$desc" ;;
  esac
  printf "   %-26s ${V}%-9s${N} ${col}%-7s${N} %s\n" "$host" "OK" "$code" "$nota"
done

echo
echo "${B}════════ FIN ════════${N}"
echo "${G}Leyenda: 200/301 = arriba · 502/503 = proceso local muerto · 530/000 = tunel caido · SIN DNS = falta el registro${N}"
echo
