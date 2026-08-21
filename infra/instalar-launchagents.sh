#!/usr/bin/env bash
# ==========================================================================
# instalar-launchagents.sh — Convierte los servicios lanzados a mano en
# LaunchAgents de macOS: arrancan solos al bootear y se revive si se caen.
#
# Correr EN EL MAC MINI:   bash infra/instalar-launchagents.sh
#
# Por defecto SOLO MUESTRA lo que haría (dry-run).
# Para aplicar de verdad:  bash infra/instalar-launchagents.sh --aplicar
# ==========================================================================
set -uo pipefail

APLICAR=0
[ "${1:-}" = "--aplicar" ] && APLICAR=1

V=$'\e[32m'; R=$'\e[31m'; A=$'\e[33m'; G=$'\e[90m'; N=$'\e[0m'; B=$'\e[1m'
DEST="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/bellapop"

[ "$(uname)" = "Darwin" ] || { echo "${R}Esto es solo para macOS.${N}"; exit 1; }

echo
echo "${B}════ INSTALADOR DE LAUNCHAGENTS ════${N}"
[ $APLICAR -eq 0 ] && echo "${A}MODO SIMULACION — nada se escribe. Usa --aplicar para ejecutar.${N}"
echo

# ── Localizar los repos en el disco ───────────────────────────────────────
buscar_repo() {                      # $1 = nombre de carpeta
  local n="$1" p
  for p in "$HOME/braindma/proyectos/oet/$n" "$HOME/braindma/proyectos/$n" \
           "$HOME/Desktop/OET/$n" "$HOME/proyectos/$n" "$HOME/$n"; do
    [ -d "$p" ] && { echo "$p"; return 0; }
  done
  p=$(find "$HOME" -maxdepth 5 -type d -name "$n" -not -path '*/.*' 2>/dev/null | head -1)
  [ -n "$p" ] && echo "$p"
}

TORQ=$(buscar_repo torque-preview)
OPENCLAW="${OPENCLAW_DIR:-$HOME/.openclaw}"
ASTER="${ASTER_DIR:-$HOME/.aster-bot}"

echo "${B}Rutas detectadas${N}"
for par in "torque-preview:$TORQ" "openclaw:$OPENCLAW" "aster-bot:$ASTER"; do
  n="${par%%:*}"; p="${par#*:}"
  if [ -n "$p" ] && [ -d "$p" ]; then echo "   ${V}●${N} $n → $p"
  else echo "   ${R}●${N} $n → NO ENCONTRADO ${G}(se omiten sus servicios)${N}"; fi
done
echo

NODE=$(command -v node || echo "/usr/local/bin/node")
PY=$(command -v python3 || echo "/usr/bin/python3")
CFD=$(command -v cloudflared || echo "/opt/homebrew/bin/cloudflared")
CFG_CFD="$HOME/.cloudflared/config.yml"
TUNNEL_UUID="${TUNNEL_UUID:-75836e06-bcb3-4f73-85ab-5b339aba38de}"

# etiqueta|ejecutable|argumento|directorio_de_trabajo|descripcion
SERVICIOS=()
# El tunel solo se toca si NO hay uno vivo. Instalar un segundo conector
# sobre uno que ya funciona no arregla nada y complica el diagnostico.
CFD_YA=0
if pgrep -f "cloudflared" >/dev/null 2>&1; then
  CFD_YA=1
elif [ -x "$CFD" ] || command -v cloudflared >/dev/null 2>&1; then
  SERVICIOS+=("co.bellapop.cloudflared|$CFD|TUNEL|$HOME|tunel named $TUNNEL_UUID")
fi
[ -n "$TORQ" ] && [ -d "$TORQ" ] && SERVICIOS+=(
  "co.bellapop.torq.vitrina|$NODE|$TORQ/servidor/vitrina.js|$TORQ|:8795 torque.themesa.co + showroom.bellapop.co"
  "co.bellapop.torq.sala|$NODE|$TORQ/servidor/sala.js|$TORQ|:8790 torq.bellapop.co + torque.bellapop.co"
)
# servidor.js (:8787) NO se instala a proposito: el ingress del tunel no lo
# expone por ningun hostname, y arranca con WA_TOKEN/WA_APP_SECRET vacios
# —un webhook que no puede validar firmas de Meta—. Si algun dia se expone,
# primero hay que darle sus variables de entorno.
[ -d "$OPENCLAW/workspace-aster/dashboard" ] && SERVICIOS+=(
  "co.bellapop.aster.dashboard|$PY|$OPENCLAW/workspace-aster/dashboard/dashboard_server.py|$OPENCLAW|:8092 bots.bellapop.co + btc.themesa.co (TRADING EN VIVO)"
)
[ -d "$OPENCLAW/canvas" ] && SERVICIOS+=(
  "co.bellapop.missioncontrol|$PY|$OPENCLAW/canvas/log_server.py|$OPENCLAW|:18795 mc.bellapop.co + api.bellapop.co"
)

[ ${#SERVICIOS[@]} -eq 0 ] && { echo "${R}No se encontró ningún servicio. Exporta OPENCLAW_DIR / ASTER_DIR y reintenta.${N}"; exit 1; }

if [ $APLICAR -eq 1 ]; then mkdir -p "$DEST" "$LOGS"; fi

echo "${B}Servicios${N}"
for row in "${SERVICIOS[@]}"; do
  IFS='|' read -r label bin arg wd desc <<<"$row"
  plist="$DEST/$label.plist"

  # NUNCA instalar encima de un puerto que ya esta escuchando: el proceso
  # nuevo no puede tomarlo, muere, y KeepAlive lo revive en bucle sobre un
  # servicio sano. Se respeta lo que ya funciona.
  PUERTO_SVC=$(echo "$desc" | grep -oE '^:[0-9]+' | tr -d ':')
  if [ -n "$PUERTO_SVC" ] && command -v lsof >/dev/null 2>&1 \
     && lsof -nP -iTCP:"$PUERTO_SVC" -sTCP:LISTEN >/dev/null 2>&1 \
     && ! launchctl list 2>/dev/null | grep -q "$label"; then
    echo "   ${V}○${N} $label ${G}— :$PUERTO_SVC ya escucha, se deja intacto${N}"; continue
  fi

  if [ "$arg" = "TUNEL" ]; then
    if [ ! -f "$CFG_CFD" ]; then
      echo "   ${R}●${N} $label ${G}— falta $CFG_CFD, el tunel no puede arrancar${N}"; continue
    fi
    ARGS="<string>tunnel</string><string>--config</string><string>$CFG_CFD</string><string>run</string><string>$TUNNEL_UUID</string>"
  elif [ ! -f "$arg" ]; then
    echo "   ${A}○${N} $label ${G}— omitido, no existe $arg${N}"; continue
  else
    ARGS="<string>$arg</string>"
  fi

  if [ $APLICAR -eq 0 ]; then
    echo "   ${G}○${N} $label ${G}($desc)${N}"; continue
  fi

  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>$bin</string>$ARGS</array>
  <key>WorkingDirectory</key><string>$wd</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOGS/$label.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$label.err</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
</dict>
</plist>
PLIST

  launchctl bootout "gui/$UID/$label" 2>/dev/null
  if launchctl bootstrap "gui/$UID" "$plist" 2>/dev/null; then
    echo "   ${V}●${N} $label cargado ${G}($desc)${N}"
  else
    echo "   ${R}●${N} $label FALLO al cargar ${G}— revisa $LOGS/$label.err${N}"
  fi
done

# Dar tiempo a que los procesos tomen su puerto antes de que el usuario
# corra el diagnostico: si no, la seccion de puertos los reporta MUERTOS
# aunque esten arrancando bien, y parece que fallo.
if [ $APLICAR -eq 1 ]; then sleep 3; fi

echo
echo "${B}cloudflared${N}"
if [ $CFD_YA -eq 1 ]; then
  echo "   ${V}●${N} Ya hay un cloudflared corriendo (pid: $(pgrep -f cloudflared | tr '\n' ' '))."
  echo "   ${G}Se deja INTACTO. Este script no lo toca ni instala otro encima.${N}"
  echo "   ${G}Para ver quien lo administra:  launchctl list | grep -i cloudflare${N}"
elif [ -f "$CFG_CFD" ]; then
  echo "   ${V}●${N} config encontrado: ${G}$CFG_CFD${N}"
  echo "   ${G}Se instala como LaunchAgent de usuario (arriba). NO uses${N}"
  echo "   ${G}'sudo cloudflared service install': tu tunel es named (cert.pem +${N}"
  echo "   ${G}config.yml en tu home) y ese comando pide un TOKEN, no un UUID.${N}"
else
  echo "   ${R}●${N} NO existe $CFG_CFD"
  echo "   ${G}Sin el, el tunel no arranca. Revisa: cloudflared tunnel list${N}"
fi

echo
if [ $APLICAR -eq 0 ]; then
  echo "${A}Simulación. Para aplicar:  bash infra/instalar-launchagents.sh --aplicar${N}"
else
  echo "${V}Listo.${N} Verifica con:  ${G}bash infra/diagnostico-dominios.sh${N}"
  echo "Logs en: ${G}$LOGS/${N}"
  echo "Quitar uno: ${G}launchctl bootout gui/\$UID/LABEL \&\& rm $DEST/LABEL.plist${N}"
fi
echo
