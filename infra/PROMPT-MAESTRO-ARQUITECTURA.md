# Prompt maestro — Arquitectura completa del negocio de Daniel Mesa

Para pegar en una sesión NUEVA de Claude Code CLI corriendo en el Mac mini.
Escrito el 2026-08-24 por una sesión de Claude Code en la web, que diagnosticó
la infraestructura pero no tenía acceso a la máquina.

---

Eres el arquitecto técnico de mi operación. Trabajas en mi Mac mini con acceso
real al disco. Soy Daniel Mesa, CFO externo y asesor estratégico; manejo varios
negocios y proyectos en paralelo, y mi problema es que el conocimiento de cada
uno se está perdiendo entre sesiones.

Trabaja en español. Todas las cifras de negocio en pesos colombianos.

## El problema que vas a resolver

Mis skills de Claude prometen ser "el contexto acumulado de todas las sesiones",
pero al menos uno lleva meses congelado: `guapa-dashboard` tiene seis marcas de
fecha y todas dicen `2026-04-28`, mientras el repo tuvo su último push el
30 de mayo y yo he hecho ajustes hasta esta semana. Peor: ese skill trae una
sección "Estado DB (snapshot 2026-04-28)" con cartera, saldo bancario y deuda
de tarjeta presentados como si fueran de hoy. Una sesión que lea eso sin notar
la fecha puede darle cifras de hace cuatro meses a un cliente.

No sé si el resto de skills tiene la misma deriva. Averígualo.

## Fase 0 — Inventario real (no asumas nada, mídelo)

Recorre mi máquina y levanta el estado verdadero:

1. **Todos los repos git** bajo `~`: rama actual, último commit, y sobre todo
   **cambios sin commitear y commits sin pushear**. Esto es urgente: si hay
   trabajo de Guapa de junio–agosto solo en local, estoy a un disco dañado de
   perderlo. Repórtalo primero y aparte.
2. **Todos los skills** en `~/.claude/skills/` (incluida `synced/`): tamaño,
   fecha real de modificación, y qué fecha *declara* cada uno por dentro.
3. **Carpetas de trabajo que no son git**: `~/Guapa`, `~/.openclaw`,
   `~/.aster-bot`, `~/braindma`, y lo que encuentres.
4. **Servicios**: LaunchAgents, cron, puertos escuchando, `cloudflared`.
5. **Configuración de Claude**: `claude mcp list`, y los `CLAUDE.md` que existan.

Hay un script de solo lectura que hace buena parte de esto:
`infra/inventario-local.sh` en el repo `oet-dashboard`, rama
`claude/domain-projects-diagnostic-3pi7id`. Úsalo o mejóralo.

**Entrega de esta fase, antes de seguir:** una tabla de deriva — por proyecto,
qué fecha declara el skill vs. último commit real vs. si hay trabajo sin
guardar. Muéstramela y espera mi visto bueno.

## Fase 1 — Mapa del negocio

Con el inventario en mano, arma el mapa completo:

**Negocio → proyectos → repos → skills → dominios → servicios locales.**

Lo que ya sé y puedes dar por cierto (verificado hoy contra
`~/.cloudflared/config.yml`):

| Proyecto | Repo | Dominio | Puerto local |
|---|---|---|---|
| OET · Panel 360 | `clawddma/oet-dashboard` | `oet.themesa.co` | 8131 |
| Guapa · B2B | `clawddma/guapa-dashboard` | `guapa.bellapop.co` | 8000 |
| Guapa US | `clawddma/guapa-us` | — | — |
| TORQ · vitrina | `clawddma/torque-preview` | `torque.themesa.co` · `showroom.bellapop.co` | 8795 |
| TORQ · sala | idem | `torq.bellapop.co` · `torque.bellapop.co` | 8790 |
| Trading · dashboard | `clawddma/openclaw` | `bots.bellapop.co` · `btc.themesa.co` | 8092 |
| Mission Control | idem | `mc.bellapop.co` · `api.bellapop.co` | 18795 |
| Aster · webhook | idem | `aster.bellapop.co` ⚠️ SIN REGLA DE INGRESS | 8081 |
| Declará | `clawddma/declara` | `fiscal.bellapop.co` ⚠️ SIN DNS | — |
| Qlub | `clawddma/qlub-dashboard` | — | — |
| BizAcq | `clawddma/bizacq-dashboard` | — | — |
| DM Financiero | `clawddma/dm-financiero` | `fp.bellapop.co` (?) | — |
| Mesa Infantino | — | `mi.bellapop.co` (Cloudflare Pages) | — |
| Jerseys | — | `jerseys.bellapop.co` (Cloudflare Pages) | — |

Sin dueño identificado, averígualo: `lx.bellapop.co` (3456),
`planner.bellapop.co` (8090), `plan.bellapop.co` / `ay.themesa.co` (7893),
`mj.themesa.co` (7900), `dni.themesa.co` (8093), `mindtech.themesa.co` (8130),
`mindtech-lab.themesa.co` (8132), `mi-chat.bellapop.co` (8134),
`oet.bellapop.co` (8094), `themesa.co` (8002).

El detalle completo está en `infra/DOMINIOS.md` de ese mismo repo y rama.

## Fase 2 — El estándar de skill

Diseña **una sola plantilla** para todos mis skills de proyecto. Requisito
innegociable, que es la lección del skill de Guapa:

> **Separar lo permanente de lo que caduca.** La arquitectura, las reglas y los
> antipatrones son permanentes. Las cifras de negocio, los saldos y los
> pendientes caducan. Van en una sección `## ESTADO` al final, con fecha
> obligatoria en el encabezado y una advertencia explícita de que si la fecha
> tiene más de N días, hay que verificar contra la fuente antes de usar el dato.

Además:
- Encabezado con `Última verificación: YYYY-MM-DD` y contra qué se verificó.
- Nada de cifras de negocio fuera de `## ESTADO`.
- Sección de "cómo verificar el estado" — el comando o consulta que regenera
  esos números, para que la próxima sesión los actualice sola en vez de creerlos.

## Fase 3 — Reescritura

Aplica la plantilla a todos mis skills de proyecto: `oet-dashboard`,
`guapa-dashboard`, `declara-dev`, `openclaw-trading`, y los que falten según tu
inventario. **Preserva todo el conocimiento existente** — no se pierde una sola
regla, antipatrón o troubleshooting. Solo se reorganiza y se le pone fecha a lo
que caduca. Lo que esté desactualizado, verifícalo contra el código real y
actualízalo; si no puedes verificarlo, márcalo como dudoso en vez de repetirlo.

Proyectos sin skill (Qlub, BizAcq, TORQ, DM Financiero, Guapa US): crea el suyo
con la misma plantilla.

## Fase 4 — Protocolo de trabajo

Escribe el runbook de cómo debo operar de aquí en adelante:

- **Un hilo por proyecto**, aunque dos proyectos sean del mismo cliente.
- **Protocolo de cierre** antes de cada `/clear` o de cerrar sesión:
  código commiteado y pusheado → skill actualizado → handover si aplica.
- **Qué va en memoria global vs. en skill de proyecto.** Regla: lo específico
  de un proyecto NUNCA en memoria global, o contamina todos los demás hilos.
- **Un comando o script que audite la deriva** y me avise qué skill lleva
  demasiado sin verificar.
- Cómo arrancar una sesión de cada proyecto para gastar el mínimo de contexto.

## Entregables

1. `ARQUITECTURA.md` — el mapa completo del negocio.
2. Los skills reescritos con el estándar.
3. `AUDITORIA-DERIVA.md` — qué estaba desactualizado y qué se corrigió.
4. El script de auditoría de deriva.
5. `RUNBOOK.md` — cómo trabajo de ahora en adelante.

**Dónde:** crea un repo propio para esto, privado. No lo metas en
`oet-dashboard` — ahí terminó lo de hoy solo porque era el único repo con
permiso de escritura, y es un error de arquitectura que quiero corregir.

## Reglas de ejecución

- **Trabaja por fases y guarda al terminar cada una.** No acumules cinco fases
  en memoria para escribirlas al final: si se llena el contexto, se pierde todo.
  Escribe a disco, commitea, y sigue.
- **Muéstrame la tabla de deriva de la Fase 0 antes de continuar.**
- **`:8092` es una operación de trading en vivo.** No reiniciar, no matar, no
  instalar nada encima.
- **Nunca cargues un LaunchAgent sobre un puerto que ya escucha** — el proceso
  nuevo no toma el puerto, muere, y `KeepAlive` lo revive en bucle. Ya pasó.
- **No uses `sudo cloudflared service install`.** Mi túnel es *named*
  (UUID `75836e06-bcb3-4f73-85ab-5b339aba38de`); ese comando espera un token
  y falla.
- **Mide, no infieras.** Si un dato se puede verificar en disco o en git,
  verifícalo antes de escribirlo. La mitad de los errores de hoy vinieron de
  deducir cosas de comentarios del código en vez de leer la configuración real.

## Pendiente aparte (no lo olvides, pero no lo mezcles)

El repo `oet-dashboard` es **público**, y hoy quedó ahí una carpeta `infra/`
con el inventario de mis 27 hostnames internos, sus puertos y el UUID del
túnel — en la rama `claude/domain-projects-diagnostic-3pi7id`, sin mergear.
Hay que moverlo a un repo privado y borrar esa rama. Recuérdamelo al final.
