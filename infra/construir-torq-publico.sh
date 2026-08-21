#!/usr/bin/env bash
# ==========================================================================
# construir-torq-publico.sh — Genera el sitio estático público de TORQ,
# listo para Cloudflare Pages, replicando la lista blanca de vitrina.js.
#
#   bash infra/construir-torq-publico.sh RUTA_TORQUE_PREVIEW [destino]
#
# La regla es la de vitrina.js y no se relaja: se COPIA lo permitido, no se
# excluye lo privado. Un archivo nuevo en el repo nace fuera del sitio
# público y hay que meterlo a mano en las listas de abajo.
# ==========================================================================
set -euo pipefail

SRC="${1:-}"
OUT="${2:-./_publico}"
HOST="${TORQ_HOST:-torque.themesa.co}"

V=$'\e[32m'; R=$'\e[31m'; G=$'\e[90m'; N=$'\e[0m'; B=$'\e[1m'

[ -n "$SRC" ] || { echo "uso: $0 RUTA_TORQUE_PREVIEW [destino]"; exit 1; }
[ -f "$SRC/index.html" ] || { echo "${R}No parece torque-preview: falta index.html en $SRC${N}"; exit 1; }

# ── Lista blanca — espejo exacto de vitrina.js ────────────────────────────
PAGINAS="index.html vigo.html box.html mage.html simulador.html politica-datos.html"
SUELTOS="torq.css tema.js menu.js contacto.js favicon.ico"
EXT_OK="jpg jpeg png svg webp ico css"

echo
echo "${B}Construyendo TORQ público${N}  ${G}$SRC → $OUT  (host: $HOST)${N}"

rm -rf "$OUT"; mkdir -p "$OUT"

# ── Versión del CSS: hash de contenido (en CI el mtime no significa nada) ──
if [ -f "$SRC/torq.css" ]; then
  VCSS=$( (shasum -a 1 "$SRC/torq.css" 2>/dev/null || sha1sum "$SRC/torq.css") | cut -c1-10 )
else
  VCSS="0"
fi

# ── Páginas, con las mismas transformaciones que hace vitrina.js ──────────
for f in $PAGINAS; do
  [ -f "$SRC/$f" ] || { echo "   ${R}!${N} falta $f"; continue; }
  python3 - "$SRC/$f" "$OUT/$f" "$HOST" "$VCSS" <<'PY'
import re, sys
src, dst, host, vcss = sys.argv[1:5]
h = open(src, encoding="utf-8").read()

# 1. Fuera la consola interna: admin.js enumera los módulos privados.
h = re.sub(r'[ \t]*<script[^>]*src=["\']admin\.js["\'][^>]*>\s*</script>\s*\n?', '', h, flags=re.I)

# 2. canonical/og:url apuntan al dominio con login; se reescriben al público
#    o Google sigue un 401 y la vista previa de WhatsApp sale vacía.
h = h.replace("https://torq.bellapop.co", "https://" + host)

# 3. Cache-bust del CSS por hash de contenido.
h = re.sub(r'(href=["\'])torq\.css(["\'])', r'\1torq.css?v=' + vcss + r'\2', h, flags=re.I)

# 4. noindex si la página no trae el suyo (dos <meta robots> es basura).
if not re.search(r'name=["\']robots["\']', h, flags=re.I):
    h = re.sub(r'</head>', '<meta name="robots" content="noindex, nofollow">\n</head>', h, count=1, flags=re.I)

open(dst, "w", encoding="utf-8").write(h)
PY
  echo "   ${V}·${N} $f"
done

# ── Archivos sueltos ──────────────────────────────────────────────────────
for f in $SUELTOS; do
  [ -f "$SRC/$f" ] && { cp "$SRC/$f" "$OUT/$f"; echo "   ${V}·${N} $f"; }
done

# ── img/ — solo extensiones permitidas ────────────────────────────────────
if [ -d "$SRC/img" ]; then
  mkdir -p "$OUT/img"; n=0
  for ext in $EXT_OK; do
    for f in "$SRC/img"/*."$ext"; do
      [ -f "$f" ] && { cp "$f" "$OUT/img/"; n=$((n+1)); }
    done
  done
  echo "   ${V}·${N} img/ ($n archivos)"
fi

# ── Verificación: nada privado se coló ────────────────────────────────────
echo
echo "${B}Verificación${N}"
FUGA=0
for prohibido in admin.js cubo.js conocimiento.js bot-motor.js nav.js panel-nav.js \
                 CONTEXTO.md LEADS.md PAUTA.md COMPETENCIA.md INTELIGENCIA.md \
                 CLAUDE.md inventario.json crm.html leads.html analitica.html \
                 inteligencia.html mercado.html jugadas.html chat.html bot.html \
                 respuestas.html piezas.html admin servidor fuentes piezas; do
  if [ -e "$OUT/$prohibido" ]; then echo "   ${R}✗ FUGA: $prohibido${N}"; FUGA=1; fi
done
if grep -rl 'admin\.js' "$OUT" >/dev/null 2>&1; then
  echo "   ${R}✗ Alguna página aún referencia admin.js${N}"; FUGA=1
fi
if grep -rl 'torq\.bellapop\.co' "$OUT" >/dev/null 2>&1; then
  echo "   ${R}✗ Quedaron URLs a torq.bellapop.co (dominio con login)${N}"; FUGA=1
fi
[ $FUGA -eq 0 ] && echo "   ${V}✓ Sin fugas. Solo la lista blanca.${N}"

echo
echo "${B}Resultado:${N} $(find "$OUT" -type f | wc -l | tr -d ' ') archivos en ${G}$OUT${N}"
[ $FUGA -eq 1 ] && { echo "${R}NO DESPLEGAR hasta resolver las fugas.${N}"; exit 1; }
echo
