# Mapa de dominios e infraestructura — Daniel Mesa

Levantado el 2026-08-21 a raíz de la caída de `torque.themesa.co`.

---

## 1. Causa raíz de la caída

**Casi todos los sitios son procesos locales del Mac mini expuestos por un
Cloudflare Tunnel (`cloudflared`). No son hosting.**

Cloudflare solo enruta: la DNS y el certificado siguen vivos, pero detrás del
túnel no hay nadie escuchando. Por eso el dominio "existe" y aun así no carga.

Al cerrar todos los proyectos desde el terminal, se mataron los procesos de
origen y —si también cayó `cloudflared`— el túnel. Resultado: **error 1033 /
530 / 502 en todos los subdominios tunelizados a la vez.**

`torque.themesa.co` en concreto lo sirve:

```
torque-preview/servidor/vitrina.js   →   localhost:8795
```

Está escrito en la cabecera del propio archivo: `Correr: node servidor/vitrina.js`
· `Sale a: torque.themesa.co`. Sin ese proceso vivo, el dominio no responde.

---

## 2. Inventario real — desde `~/.cloudflared/config.yml`

Fuente autoritativa (leída en el Mac mini el 2026-08-21). Reemplaza el mapa
anterior, que se dedujo de comentarios del código y tenía errores.

Túnel: `75836e06-bcb3-4f73-85ab-5b339aba38de`

| Hostname | Puerto | Proceso |
|---|---|---|
| `torque.themesa.co` | 8795 | `torque-preview/servidor/vitrina.js` |
| `showroom.bellapop.co` | 8795 | idem (alias) |
| `torq.bellapop.co` | 8790 | `torque-preview/servidor/sala.js` |
| `torque.bellapop.co` | 8790 | idem (alias) |
| `mc.bellapop.co` | 18795 | `canvas/log_server.py` |
| `api.bellapop.co` | 18795 | idem — **no es `servidor.js`** |
| `bots.bellapop.co` | 8092 | `dashboard_server.py` ⚠️ trading en vivo |
| `btc.themesa.co` | 8092 | idem (vista pública) |
| `guapa.bellapop.co` | 8000 | Guapa · FastAPI |
| `themesa.co` · `www.themesa.co` | 8002 | sitio raíz |
| `themesa-origin.bellapop.co` | 8002 | idem |
| `oet.themesa.co` | 8131 | Panel 360 OET |
| `oet.bellapop.co` | 8094 | — |
| `lx.bellapop.co` | 3456 | — |
| `planner.bellapop.co` | 8090 | — |
| `plan.bellapop.co` · `ay.themesa.co` | 7893 | — |
| `mj.themesa.co` | 7900 | — |
| `dni.themesa.co` | 8093 | — |
| `mindtech.themesa.co` | 8130 | — |
| `mindtech-lab.themesa.co` | 8132 | — |
| `mi-chat.bellapop.co` | 8134 | — |
| *(catch-all)* | — | `http_status:404` |

**Fuera del túnel** (Cloudflare Pages/Workers, no dependen del Mac):
`mi.bellapop.co` · `jerseys.bellapop.co` · `fp.bellapop.co`

### Correcciones respecto al mapa anterior
- `api.bellapop.co` va a **:18795** (Mission Control), no a `servidor.js` en :8787.
  Por eso responde 200 con :8787 muerto.
- `servidor.js` (:8787) **no está expuesto** por ningún hostname.
- Existían 12 hostnames que la exploración por DNS no encontró, porque se
  adivinaron nombres en vez de leer el ingress.

### Problemas abiertos
1. **`aster.bellapop.co` no tiene regla de ingress.** No aparece en el
   `config.yml`, así que cae al catch-all y devuelve 404. El webhook de
   TradingView apunta ahí: las señales no llegan. Además :8081 está muerto.
   Son dos fallas apiladas — levantar el bot no basta, falta la regla.
2. **El túnel no está supervisado.** `launchctl list` muestra
   `homebrew.mxcl.cloudflared` con PID `-` y último exit `1`: el servicio de
   brew falló. El pid 734 corre por fuera de launchd. Funciona hoy, pero no
   sobrevive un reinicio ni un crash.
3. **`oet.bellapop.co` → :8094 devuelve 404.** La regla existe, así que el 404
   lo emite el origen, no el túnel. Revisar qué corre en :8094.
4. **`bellapop.co` y `www.bellapop.co` → 403.** Sin regla de ingress; el 403 no
   es del catch-all (sería 404), así que viene de Cloudflare — WAF o Access.

## 3. Estado de GitHub Pages

Ningún repositorio público (`oet-dashboard`, `torque-preview`, `qlub-dashboard`,
`bizacq-dashboard`) tiene archivo `CNAME`. Es decir: **ninguno tiene dominio
propio configurado en GitHub Pages.** Los sitios de Pages viven en su URL
`github.io`:

- https://clawddma.github.io/oet-dashboard/ — OET Panel 360 (auto-sync activo,
  último commit 2026-08-21 09:30)
- https://clawddma.github.io/torque-preview/ — TORQ preview

Estos **no dependen del Mac mini** y siguen arriba.

Si quieres que `oet.themesa.co` apunte a Pages hay que hacer las dos cosas:
1. `Settings → Pages → Custom domain` en el repo (crea el `CNAME`).
2. Registro CNAME en Cloudflare `oet` → `clawddma.github.io`.

Con solo el paso 2, GitHub responde 404.

---

## 4. Runbook de recuperación (en el Mac mini)

### Paso 0 — pararse en el repo (esto es lo que falló la primera vez)

```bash
cd /Users/braindma/braindma/proyectos/oet/oet-dashboard
git fetch origin
git checkout claude/domain-projects-diagnostic-3pi7id
git pull origin claude/domain-projects-diagnostic-3pi7id
```

⚠️ **Los comandos de abajo no llevan placeholders.** Se pegan tal cual. Nunca
escribas algo como `tunnel run NOMBRE` entre paréntesis angulares: zsh lee `<`
como redirección de archivo y responde `parse error near '\n'`.

### Paso 1 — diagnosticar

```bash
bash infra/diagnostico-dominios.sh
```

### Paso 2 — levantar todo (túnel + servicios)

```bash
bash infra/instalar-launchagents.sh            # simulación
bash infra/instalar-launchagents.sh --aplicar  # aplica
```

Instala también el túnel como LaunchAgent de usuario.

**NO uses `sudo cloudflared service install`.** Tu túnel es *named*
(UUID `75836e06-bcb3-4f73-85ab-5b339aba38de`, con `cert.pem` y
`config.yml` en `~/.cloudflared/`). Ese comando espera un **token** y bajo
`sudo` busca en el home de root, no en el tuyo: falla con
`Provided tunnel token is not valid (illegal base64 data at input byte 0)`.

Si ese comando alcanzó a dejar un daemon a medias:
```bash
ls -la /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
sudo cloudflared service uninstall
```

Arranque manual del túnel, si lo necesitas suelto:
```bash
cloudflared tunnel run 75836e06-bcb3-4f73-85ab-5b339aba38de
```

### Paso 3 — verificar

```bash
bash infra/diagnostico-dominios.sh
```

Todo debe quedar en 200/301.

---

## 5. Para que no vuelva a pasar

1. **LaunchAgents para todo.** Hoy varios servicios dependen de un `node …&`
   lanzado a mano en una terminal: cerrar la terminal los mata. Un
   `~/Library/LaunchAgents/*.plist` con `KeepAlive=true` los revive solos y
   sobrevive a reinicios.
2. **`sudo cloudflared service install`** para que el túnel sea un servicio del
   sistema y no un proceso de sesión.
3. **Mover lo público a Cloudflare Pages.** `torque.themesa.co` es HTML estático
   con lista blanca: no necesita un Node vivo en tu casa. En Pages queda 24/7,
   sin depender del Mac ni de tu internet. Es el cambio de mayor impacto.
4. **Monitoreo externo** (UptimeRobot / Cloudflare Health Checks) que avise por
   Telegram. Hoy te enteras cuando un cliente te escribe.

---

## 6. Entregables — LaunchAgents y Cloudflare Pages

Ambos hay que ejecutarlos **en el Mac mini**. Nadie puede hacerlo remotamente:
las sesiones de Claude Code en la web corren en contenedores Linux aislados en
la nube, sin ruta de red ni credenciales hacia tu máquina.

### 6.1 LaunchAgents — que los servicios revivan solos

```bash
bash infra/instalar-launchagents.sh              # simulación, no escribe nada
bash infra/instalar-launchagents.sh --aplicar    # instala de verdad (incluye el túnel)
```

Busca los repos en el disco, genera un `.plist` por servicio con
`RunAtLoad` + `KeepAlive` y los carga. A partir de ahí arrancan al bootear y
se reinician solos si se caen. Cerrar la terminal deja de tumbarlos.

Logs en `~/Library/Logs/bellapop/`. Para quitar uno:
```bash
launchctl bootout gui/$UID/co.bellapop.torq.vitrina
rm ~/Library/LaunchAgents/co.bellapop.torq.vitrina.plist
```

Si no encuentra alguna ruta:
```bash
OPENCLAW_DIR=~/ruta/openclaw ASTER_DIR=~/ruta/aster-bot \
  bash infra/instalar-launchagents.sh --aplicar
```

### 6.2 TORQ a Cloudflare Pages — quitarle la dependencia del Mac

`torque.themesa.co` es HTML estático: no necesita un Node vivo en tu casa.

**El detalle que no se puede pasar por alto:** `vitrina.js` no sirve el repo,
sirve una **lista blanca** de 11 archivos + `img/`. El repo contiene además
`admin.js` (que enumera los catorce módulos privados), `CONTEXTO.md`,
`LEADS.md`, `PAUTA.md`, `crm.html`, `inventario.json`… Un `pages deploy` del
repo entero **publicaría todo eso**.

Por eso el build replica la lista blanca y las cuatro transformaciones de
`vitrina.js`, y **falla con exit 1 si detecta una fuga**:

| Transformación | Por qué |
|---|---|
| Quita `<script src="admin.js">` | revela los módulos privados |
| `torq.bellapop.co` → `torque.themesa.co` | el canonical apuntaba al dominio con login: Google seguía un 401 y la vista previa de WhatsApp salía vacía |
| `torq.css?v=HASH` | cache-bust por contenido (en CI el mtime no significa nada) |
| `<meta robots noindex>` | si la página no trae el suyo |

Probar el build localmente:
```bash
bash infra/construir-torq-publico.sh ~/braindma/proyectos/torque-preview ./_publico
```

Para el despliegue automático, copiar al repo **torque-preview**:
```
infra/torque-preview-workflow/publicar-pages.yml
        → torque-preview/.github/workflows/publicar-pages.yml
infra/torque-preview-workflow/construir-torq-publico.sh
        → torque-preview/.github/workflows/construir-torq-publico.sh
```

Y en Cloudflare:
1. Crear proyecto de Pages llamado `torq`.
2. Secrets en torque-preview → Settings → Secrets → Actions:
   `CLOUDFLARE_API_TOKEN` (permiso *Cloudflare Pages: Edit*) y
   `CLOUDFLARE_ACCOUNT_ID`.
3. En el proyecto de Pages, *Custom domains* → `torque.themesa.co`.
   Cloudflare reemplaza el registro del túnel por el de Pages.
4. Ya se puede apagar el LaunchAgent `co.bellapop.torq.vitrina`.

Desde ahí, cada push a `main` republica el sitio. Sin Mac, sin túnel.
