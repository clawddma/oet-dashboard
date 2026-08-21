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

## 2. Inventario de dominios (DNS verificada 2026-08-21)

### themesa.co
| Dominio | Origen | Puerto | Depende del Mac |
|---|---|---|---|
| `themesa.co` · `www.themesa.co` | raíz | — | por confirmar |
| `torque.themesa.co` | `torque-preview/servidor/vitrina.js` | 8795 | **Sí** |
| `btc.themesa.co` | `workspace-aster/dashboard/dashboard_server.py` | 8092 | **Sí** |
| `oet.themesa.co` | Panel 360 OET | — | por confirmar |

### bellapop.co
| Dominio | Origen | Puerto | Depende del Mac |
|---|---|---|---|
| `bellapop.co` · `www.bellapop.co` | raíz | — | por confirmar |
| `torq.bellapop.co` | `torque-preview/servidor/sala.js` (con llave) | 8790 | **Sí** |
| `torque.bellapop.co` | alias de lo anterior | 8790 | **Sí** |
| `api.bellapop.co` | `torque-preview/servidor/servidor.js` (webhook WhatsApp) | 8787 | **Sí** |
| `aster.bellapop.co` | webhook TradingView → Aster DEX | 8081 | **Sí** |
| `bots.bellapop.co` | `dashboard_server.py` (privado) | 8092 | **Sí** |
| `mc.bellapop.co` | `canvas/log_server.py` — Mission Control | 18795 | **Sí** |
| `guapa.bellapop.co` | Guapa · dashboard B2B (FastAPI) | — | probable |
| `fp.bellapop.co` | Finanzas personales | — | por confirmar |
| `oet.bellapop.co` | Panel 360 OET | — | por confirmar |
| `mi.bellapop.co` | Mesa Infantino · familiar | — | **No** (Pages/Workers) |
| `jerseys.bellapop.co` | Jerseys | — | **No** (Pages/Workers) |

`mi` y `jerseys` resuelven al pool `172.66.x` de Cloudflare (Pages/Workers):
son serverless, siguen arriba aunque el Mac esté apagado.

### Registros que NO existen
`fiscal.bellapop.co` · `declara.bellapop.co` · `qlub.bellapop.co` ·
`bizacq.bellapop.co` · `us.bellapop.co` · `torq.themesa.co`

⚠️ **`fiscal.bellapop.co` no tiene registro DNS** pese a estar documentado como
la URL de producción de Declará. O nunca se creó, o se borró.

---

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

### Paso 1 — diagnosticar
```bash
bash infra/diagnostico-dominios.sh
```

### Paso 2 — levantar el túnel
```bash
pgrep -f cloudflared || cloudflared tunnel run <nombre-del-tunel>
cloudflared tunnel list          # ver los túneles configurados
cat ~/.cloudflared/config.yml    # ver el mapeo hostname → puerto
```

Si están como LaunchAgent (lo recomendable, arranca solo al bootear):
```bash
launchctl list | grep -i cloudflared
launchctl kickstart -k gui/$UID/<label>
```

### Paso 3 — levantar los orígenes
```bash
# TORQ
cd <ruta>/torque-preview
node servidor/vitrina.js &     # :8795  → torque.themesa.co
node servidor/sala.js &        # :8790  → torq.bellapop.co
node servidor/servidor.js &    # :8787  → api.bellapop.co

# Trading / Mission Control
bash ~/.aster-bot/scripts/restart_aster.sh     # :8081 + túnel
python3 ~/.openclaw/workspace-aster/dashboard/dashboard_server.py &   # :8092
python3 ~/.openclaw/canvas/log_server.py &                           # :18795
```
(Ajusta las rutas a las reales de tu máquina.)

### Paso 4 — verificar
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
bash infra/instalar-launchagents.sh --aplicar    # instala de verdad
sudo cloudflared service install                 # el túnel, aparte (pide sudo)
```

Busca los repos en el disco, genera un `.plist` por servicio con
`RunAtLoad` + `KeepAlive` y los carga. A partir de ahí arrancan al bootear y
se reinician solos si se caen. Cerrar la terminal deja de tumbarlos.

Logs en `~/Library/Logs/bellapop/`. Para quitar uno:
```bash
launchctl bootout gui/$UID/<label> && rm ~/Library/LaunchAgents/<label>.plist
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
| `torq.css?v=<hash>` | cache-bust por contenido (en CI el mtime no significa nada) |
| `<meta robots noindex>` | si la página no trae el suyo |

Probar el build localmente:
```bash
bash infra/construir-torq-publico.sh <ruta>/torque-preview ./_publico
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
