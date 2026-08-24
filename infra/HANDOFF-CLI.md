# Handoff a Claude Code CLI (local, en el Mac mini)

Contexto levantado por una sesión de Claude Code en la web el 2026-08-21.
Esa sesión no tenía acceso al Mac; dejó el diagnóstico y los scripts aquí.
Tú sí ejecutas local: termina lo que quedó.

**Lee `infra/DOMINIOS.md` antes de tocar nada.** Tiene el inventario real de
los 24 hostnames leído del ingress del túnel, no adivinado.

---

## Estado verificado (2026-08-21 10:53)

Resuelto en esta sesión: `torque.themesa.co` pasó de 502 a **200**.
`torq.bellapop.co` y `torque.bellapop.co` dan **401**, que es correcto:
`sala.js` pide clave desde el 4 de agosto. Un 401 significa origen vivo.

Sanos: `api` 200 · `mc` 200 · `guapa` 200 · `mi` 200 · `jerseys` 200 ·
`themesa.co` 200 · `bots`/`btc` 302 · `fp` 308.

---

## Restricciones — leer antes de ejecutar

1. **`:8092` es operación de trading en vivo** (`bots.bellapop.co`). No
   reiniciar, no matar, no instalar nada encima. Confirmado por el dueño.
2. **Nunca instalar un LaunchAgent sobre un puerto que ya escucha.** Ya pasó:
   el proceso nuevo no puede tomar el puerto, muere, y `KeepAlive` lo revive
   cada 10s en bucle sobre un servicio sano. `infra/instalar-launchagents.sh`
   ya trae la guarda; no la quites.
3. **No usar `sudo cloudflared service install`.** El túnel es *named*
   (UUID `75836e06-bcb3-4f73-85ab-5b339aba38de`, con `cert.pem` y
   `config.yml` en `~/.cloudflared/`). Ese comando espera un **token** y bajo
   `sudo` lee el home de root: falla con
   `Provided tunnel token is not valid (illegal base64 data at input byte 0)`.
4. **Reiniciar el túnel corta los 24 hostnames unos segundos**, incluido el
   de trading. Avisar antes.
5. Hacer respaldo de `~/.cloudflared/config.yml` antes de editarlo.

---

## Tarea 1 — `aster.bellapop.co` devuelve 404 (la más importante)

No es un dominio caído: es que **no existe la regla de ingress**. Revisa
`~/.cloudflared/config.yml` — el hostname no aparece, así que cae al
`- service: http_status:404` del final.

TradingView envía las señales a `https://aster.bellapop.co/webhook`, o sea
que **no están llegando**. Y `:8081` (el bot) también está muerto: son dos
fallas apiladas.

Pasos:
1. Confirmar con el dueño si el bot de Aster debe quedar arriba. Agregar la
   regla sin levantar el proceso solo cambia el 404 por un 502.
2. Respaldar el `config.yml`.
3. Agregar, **antes** de la regla catch-all:
   ```yaml
     - hostname: aster.bellapop.co
       service: http://localhost:8081
   ```
4. `cloudflared tunnel ingress validate`
5. Avisar del corte, reiniciar el túnel, y levantar el bot
   (`~/.aster-bot/scripts/restart_aster.sh` — revisar qué hace antes: mata
   cloudflared con `pkill -9`).
6. Verificar: `curl -s https://aster.bellapop.co/health`

## Tarea 2 — el túnel no está supervisado

`launchctl list | grep -i cloudflare` devuelve
`-  1  homebrew.mxcl.cloudflared`: PID `-` y último exit `1`. El servicio de
brew falló y el pid 734 corre fuera de launchd. Funciona hoy, pero no
sobrevive un reinicio del equipo — y de ahí cuelgan 24 hostnames.

Diagnosticar por qué falló el servicio de brew y dejarlo supervisado, o
instalar un LaunchAgent de usuario con
`tunnel --config ~/.cloudflared/config.yml run <UUID>`.
`infra/instalar-launchagents.sh` ya sabe hacerlo, pero se abstiene mientras
detecte un cloudflared vivo: hay que parar el actual primero, con aviso.

## Tarea 3 — dos diagnósticos menores

- **`oet.bellapop.co` → 404.** La regla existe (`:8094`), así que el 404 lo
  emite el origen, no el túnel. Ver qué corre en `:8094`.
- **`bellapop.co` y `www.bellapop.co` → 403.** No tienen regla de ingress y el
  403 no es del catch-all (sería 404): viene de Cloudflare — WAF o Access.
  Requiere mirar el dashboard.

## Tarea 4 — cerrar

Verificar con `bash infra/diagnostico-dominios.sh`.

⚠️ **NO hagas `git checkout main` en este repo.** La carpeta `infra/` existe
solo en la rama `claude/domain-projects-diagnostic-3pi7id` y no está mergeada:
cambiar a `main` la borra del disco, incluidos este handoff y los scripts.

Si necesitas estos archivos fuera de la rama, cópialos primero a un lugar
estable y luego cambia de rama:

```
mkdir -p ~/arquitectura
cp -r infra ~/arquitectura/
```
