---

# ADENDA — AUDITORÍA PROFUNDA DEL TAB EEFF (Financieros)

**Fecha:** 2026-04-20
**Alcance:** Los 8 sub-tabs del módulo Financiero (Inicio, P&L, EBITDA, Márgenes, Costos, Flujo, Balance, Anual).
**Trigger:** Daniel pidió evaluación profunda equivalente a la del panel Comercial, con usabilidad perfecta y comparabilidad impecable.
**Estado post-cambios:** `compareMode` (Auto/YTD/Año completo) desplegado en EEFF en commits `7edd957` + `5fd0a7c`. KPIs, tabla P&L, periodLabel y ejes X de gráficas ahora respetan el modo.

---

## E0. Contexto específico EEFF vs Comercial

El tab Financiero tiene **restricciones distintas** al Comercial:

1. **2026 está "incompleto" por diseño.** Solo hay EEFF oficial hasta Feb-26 (contador entrega ~día 15 de cada mes). Los datos de facturación de Mar/Abr 2026 están en D[] pero con `eeffPending=true` y deben excluirse de comparaciones P&L.

2. **La serie `ytd26_eeff` es la fuente de verdad.** Filtra automáticamente los meses cerrados oficialmente. Toda comparación "manzanas con manzanas" depende de contraer todos los años a esos meses.

3. **Balance es un snapshot, no una serie temporal.** Solo hay 3 períodos: Feb-25, Dic-25, Feb-26. No aplica compareMode.

4. **Daniel lee este tab con su CFO externo / contador.** Audiencia más experta que el cliente del tab Comercial. Tolera más densidad pero espera precisión quirúrgica.

---

## E1. Hallazgos CRÍTICOS del tab EEFF

### EC1 — Balance section ignora el modo de filtros (ni años ni meses ni compareMode)

**Problema:** `buildFinBalance` (línea 4013) es completamente estático: siempre muestra Feb-25/Dic-25/Feb-26 hardcoded. El usuario puede cambiar years/months/compareMode en la barra de filtros pero Balance no reacciona. Peor aún: el simulador de liquidez (`updateSim`) también trabaja con constantes.

**Impacto:**
- Rompe el modelo mental del usuario. En los otros 7 sub-tabs los filtros controlan la vista; en Balance no. Friction cognitiva.
- Riesgo de decisión equivocada: el usuario puede creer que el "Razón Corriente 0.29x" refleja el filtro activo cuando en realidad es Feb-26 hardcoded.

**Evidencia:** Líneas 4013–4300 aprox. No hay referencias a `FF.months`, `FF.years` ni `ffCompareInfo()`. `BSS` es un objeto global con 3 snapshots fijos.

**Solución corta:**
1. Añadir un sub-header explícito al sec-title: `Balance General & Liquidez <span>Snapshots trimestrales — no reactivos a filtros</span>`. Así queda claro de entrada.
2. Ocultar la barra de filtros `#fin-filter-bar` cuando `activeSection==='balance'` (igual que ya se hace en algunos sub-tabs del comercial). O al menos, oscurecer las pills con `opacity:0.45` y tooltip "Los filtros no aplican en Balance".

**Solución larga:** Cuando el contador entregue balances mensuales (si aplica), extender `BSS` a una serie y permitir filtrar por período.

**Severidad:** CRÍTICA — confunde a la audiencia experta y mina la confianza del dashboard entero.

---

### EC2 — Resumen ejecutivo de Inicio mezcla dos modelos de comparación

**Problema:** La tabla en `ini-resumen-body` (líneas 1956–1977) muestra:
- Columnas: "2024 (12m)", "2025 (12m)", "Δ 2025/24", "2026 (…label)", "Δ vs 2025 igual período"

El problema: "2024 (12m)" y "2025 (12m)" usan `ANN[2024]/ANN[2025]` que son **siempre año completo**. Ignoran totalmente el `compareMode` actual. Entonces si Daniel selecciona modo **YTD**, ve:
- 2024 año completo vs 2025 año completo (Δ calculado sobre 12m)
- 2026 Ene-Feb EEFF vs 2025 Ene-Feb (Δ calculado sobre meses cerrados)

Dos modelos de Δ en la misma tabla. La lectura rápida del fondo ("En 2025 la facturación creció X% vs 2024") siempre es 12m/12m, aunque el filtro esté en YTD.

**Impacto:** MEDIO-CRÍTICO en lectura honesta. El CFO que ve esta tabla con filtro YTD activo asumirá que toda la tabla respeta YTD.

**Solución:**
1. Hacer que las columnas "2024" y "2025" respondan a `ffAnn(y)` (ya existe y ya respeta FF.months). Si compareMode=ytd, entonces "2024 (Ene-Feb)" y "2025 (Ene-Feb)". Label dinámico en el `<th>`.
2. Recalcular el `Δ 2025/24` sobre los valores filtrados.
3. Actualizar el texto de "lectura rápida" con labels dinámicos.

**Severidad:** CRÍTICA — la tabla de Inicio es lo primero que ve Daniel. Si dice un dato distinto al modo seleccionado, el dashboard pierde credibilidad.

---

### EC3 — Tabla P&L completa (buildFinPnl) ignora `ffCompareInfo()`, usa FF.months directamente

**Problema:** En buildFinPnl, la sección de tabla (líneas 2090–2145 aprox) itera `D.filter(d=>d.y===y && (FF.months.size===0 || FF.months.has(d.m)))`. Esto significa:
- Si hay filtro manual de meses: funciona bien.
- Si no hay filtro de meses pero modo=YTD: muestra TODOS los meses de 2024/2025, pero de 2026 solo los con EEFF. Asimetría visual gigantesca — una tabla con 12 columnas de 2024, 12 columnas de 2025 y 2 columnas de 2026.

**Impacto:** CRÍTICO para comparabilidad. El KPI de arriba dice "2025 = X" (ya contraído), pero la tabla de abajo dice "2025 = 12 meses desplegados". Incoherencia interna.

**Solución:** Reemplazar `FF.months.size===0 || FF.months.has(d.m)` por `ffCompareInfo().months.includes(d.m) && !d.eeffPending`. La tabla entonces:
- Modo manual: muestra solo meses seleccionados
- Modo YTD: muestra solo meses de EEFF 2026 (Ene-Feb) — comparable
- Modo Full: muestra 12 meses — comparable

**Severidad:** CRÍTICA — esta tabla es el objeto más detallado del tab y su incoherencia es visualmente evidente.

---

### EC4 — Cumulative EBITDA chart siempre es 12 meses, ignora compareMode

**Problema:** En `buildFinEbitda` (líneas 2240–2253), el chart `ch-ebitda-cum` usa `_MNS12=[Ene..Dic]` hardcoded. Si Daniel está en modo YTD con filtro a Ene-Feb, el acumulado muestra 2024 llegando a $Xm en Dic, 2025 en $Ym en Dic, y 2026 en solo 2 puntos. Visualmente engañoso.

**Impacto:** MEDIO — el usuario experimentado entiende que es "trayectoria de crecimiento completa". Pero crea una tercera inconsistencia de eje temporal (tabla = 12m, KPIs = YTD, cum = 12m).

**Solución:**
1. Opción A (recomendada): Mantener 12m porque el acumulado cuenta una historia anual que se pierde al contraer. Pero añadir un **marker visual vertical** en el mes final de EEFF 2026 con label "EEFF cerrado hasta aquí". Contexto explícito.
2. Opción B: Respetar compareMode. Sensato pero pierde el storytelling de "la clínica generó $X en todo el año".

Yo recomiendo A. Decisión debe documentarse.

**Severidad:** MEDIA (agregamos aquí porque es el único chart que decidí mantener en 12m).

---

### EC5 — FCO "Estimado" en KPIs de Flujo ofrece datos inverosímiles

**Problema:** El primer KPI de buildFinFlujo (línea 2489) dice "FCO Estimado 2024 (12m) $X · EBITDA anual 2024". Pero:
1. EBITDA ≠ FCO. EBITDA excluye CapEx, Δ CxC, Δ Inventario, Δ Deuda. En clínicas con CxC creciendo 173% y CapEx masivo (según el propio insight crítico abajo), EBITDA sobreestima FCO en cientos de millones.
2. Llamar "FCO Estimado" a EBITDA sin ajustes es contablemente incorrecto.
3. Daniel trabaja con su CFO en este tab. El contador va a marcar esto como error de nomenclatura.

**Impacto:** CRÍTICO por credibilidad técnica. Daniel proyecta tablero al cliente (oftalmólogos) como fuente de verdad; el CFO del cliente puede descartar todo si ve este error.

**Solución:**
1. Renombrar KPI: **"EBITDA 2024 (proxy FCO)"** con tooltip explicando limitación.
2. Añadir sub-card más abajo con **FCO ajustado**: EBITDA – ΔCxC – ΔInv – CapEx – Intereses pagados. Si no hay datos, dejar el card con "Pendiente: solicitar desgloses al contador".
3. Actualizar el texto del insight rojo: ya menciona los problemas reales, perfecto — pero el KPI del tope contradice el insight del fondo. Reconciliar.

**Severidad:** CRÍTICA — error técnico visible para audiencia experta.

---

## E2. Hallazgos HIGH del tab EEFF

### EH1 — Simulador de liquidez de Balance tiene sliders que no se sienten conectados

Líneas 4075–4130 aprox. Tres sliders (EBITDA, cobro CxC, CapEx) con valores default que no provienen del balance real. Daniel puede no entender qué dispara `updateSim`. Falta:
- Valores default derivados de los datos reales (EBITDA promedio últimos 3m, % cobro CxC promedio histórico).
- Preset buttons: "Base (actual)", "Optimista", "Pesimista" — un click y los 3 sliders se reposicionan.
- Scenario comparison: mostrar 3 líneas en el chart de proyección en lugar de solo una.

**Solución:** Añadir `<div class="scenario-pills">` con 3 presets encima de los sliders. Reduce fricción y hace el simulador inmediatamente útil.

### EH2 — Tab P&L tiene 4 gráficas + tabla de 12 columnas, viewport vertical móvil inutilizable

La sección P&L (`buildFinPnl`, líneas 1989–2145) apila:
- 3 charts (`ch-pnl-main`, `ch-pnl-gastos`, `ch-pnl-un`) cada uno con altura ~185px
- Tabla P&L con mínimo 900px width

En iPhone: scroll horizontal obligado en la tabla, y 3 charts de densidad máxima encima. Sin priorización.

**Solución:**
1. Mover los 3 charts a un **carousel/accordion**. Mostrar por default solo `ch-pnl-main` (el más completo). "Ver más" expande los otros 2.
2. La tabla: convertirla a **mobile cards** (patrón ya descrito en el skill `responsive-mobile-web` § 10). Una card por período, con KPIs apilados verticales.
3. En desktop ≥1024px, mantener el layout actual de 3 charts + tabla.

### EH3 — `ch-mg-cmp24` y `ch-mg-cmp25` en Márgenes muestran siempre 12m ignorando compareMode

Líneas 2324–2336. Estos charts fueron dejados explícitamente con 12 labels de meses para comparar "paralelo visual por mes". Pero si Daniel está en modo YTD con los demás charts contraídos, estos 2 charts contradicen esa decisión.

**Solución:**
1. Si `compareMode !== 'full'`, contraer también estos charts usando `ffCompareInfo().months`. Consistencia > patrón visual.
2. O: añadir un toggle local en la card "Ver 12 meses" que override solo estos 2 charts. Tooltip-guiado.

### EH4 — No hay drill-down de Ingresos → por Procedimiento → por Doctor

El tab Comercial tiene el desglose. El tab EEFF no conecta. Si Daniel ve que Oct 2025 tuvo caída de Ingresos en `ch-pnl-main`, tiene que cambiar manualmente al tab Comercial, aplicar filtro Oct 2025, y navegar. 4 clics + cambio de contexto.

**Solución:** Añadir un click-through en `ch-pnl-main`: al clickar una barra (o un mes en leyenda), abrir un modal con breakdown Comercial de ese mes. Patrón estándar Tableau. Requiere Chart.js `onClick` handler.

### EH5 — KPIs del tab Inicio no muestran "vs 2024" explícito en la variación

En `kpiCard('Facturación 2025', fv(a25.ing), fp(var25_24_ing)+' vs 2024')`, el delta se calcula pero sin color ni símbolo fuerte. En Apple/Tableau pattern, un delta "+18% ↑" verde es preatentivo. Ahora es gris/regular.

**Solución:** Upgrade a `kpiCardV2(value, delta, {vs:'2024', direction:'up', severity:'success'})`. Flecha+color+bold. Requiere crear variante de `kpiCard` (o extender con opts).

---

## E3. Hallazgos MEDIUM del tab EEFF

### EM1 — Tab Anual no tiene sparkline por indicador
El resumen anual es una tabla de valores absolutos + %. Ideal: añadir columna sparkline 12m para cada indicador. Un mini-chart por fila ayuda a ver tendencia intra-año sin cambiar de sub-tab.

### EM2 — Inconsistencia de label "EEFF" vs "YTD EEFF" vs "2026E" vs "2026 YTD"
He contado 5 variantes del mismo concepto en el tab. `ffYtd26Label()` debería ser single source of truth. Audit revela: `'2026 EEFF'`, `'2026E'`, `'26E'`, `'2026 YTD'`, `'2026 YTD (XmEEFF)'`. Unificar bajo una función `label26()` con 3 variantes: short, medium, full. Luego pasar el scope deseado según contexto de chart.

### EM3 — Tooltips de charts no muestran comparación año-anterior inline
Ejemplo: al hover sobre la barra "EBITDA Abr 2025" en `ch-ebitda-full`, se podría mostrar: "Abr 2025: $150M | Abr 2024: $120M | Δ +25%". Actualmente solo muestra valor del mes tocado. Pattern Power BI "compare to previous period".

### EM4 — "Peor mes" y "Mejor mes" en EBITDA KPIs son hardcoded (Ago-25, Sep-25)
Línea 2154–2155. Si Daniel filtra a 2024 solo, ve "Mejor mes: Ago-25" aunque 2025 está fuera del filtro. Bug. Debería calcularse dinámicamente sobre `ffYr()` filtrados.

### EM5 — Tabla P&L en móvil desborda horizontal sin indicador visual de scroll
El contenedor `<div style="overflow-x:auto">` permite scroll pero no lo advierte. Añadir fade/shadow en el borde derecho o "👉 Desliza" hint en primera carga móvil.

---

## E4. Hallazgos LOW del tab EEFF

### EL1 — Formato de números en tabla P&L mezcla "Pdte." italic gray con valores
Funciona pero visualmente rompe alineación de decimales. Usar `font-variant-numeric:tabular-nums` y una versión fantasma `—` centrada para Pdte.

### EL2 — Badge `st-badge` en sec-titles no es clickable
Dice "EEFF: Ene 2024 – Feb 2026 · Facturación hasta Abr 2026". Ideal: clickar el badge abre un modal explicando la diferencia entre EEFF oficial y facturación interna.

### EL3 — Duplicación del chart EBITDA en Inicio (ch-ini-ebitda) y Ebitda (ch-ebitda-full)
Son casi el mismo gráfico. Inicio podría consolidar EBITDA como "preview" linkeable a sub-tab EBITDA.

### EL4 — Insight boxes son muy textosos en mobile
Bloques como "🚨 Contexto real de liquidez" ocupan 6-8 líneas en móvil. Añadir `data-expanded` toggle: colapsado muestra solo headline; click abre el texto completo.

### EL5 — Color scheme no usa tokens CSS
Los colores `_YC_p`, `_YC_e`, `_YC_m`, etc. están duplicados en 7 funciones. Definir `--c-2024`, `--c-2025`, `--c-2026` en `:root` y referenciarlas con `getComputedStyle(document.documentElement).getPropertyValue('--c-2025')` (o usar `var()` donde CSS-puro lo permita).

---

## E5. Comparabilidad — mapa definitivo del tab EEFF (post-commit)

| Sub-tab | KPIs respetan compareMode | Charts X respetan compareMode | Tabla respeta compareMode | Acción pendiente |
|---------|---------------------------|--------------------------------|---------------------------|-------------------|
| Inicio | ✅ (ffAnn + ffYtd26) | ✅ (modo anual)  · ⚠️ PERIOD usa _AY | ❌ usa ANN directo | **EC2 fix** |
| P&L | ✅ aggP | ✅ _mArr_p | ❌ usa FF.months sin ffCompareInfo | **EC3 fix** |
| EBITDA | ✅ | ✅ _mArr_e (excepto cum) | N/A | EC4 decisión |
| Márgenes | ✅ | ⚠️ ch-mg-cmp* ignoran compareMode | N/A | **EH3 fix** |
| Costos | ✅ | ✅ _mArr_c | N/A | OK |
| Flujo | ✅ | ✅ _mArr_f | ✅ mkW usa ffAnn | ⚠️ EC5 naming |
| Anual | ✅ | N/A | ✅ | OK |
| Balance | ❌ static | ❌ static | ❌ static | **EC1 fix — mostrar disclaimer** |

**Status global:** Después de los commits `7edd957` + `5fd0a7c`, la comparabilidad en charts (ejes X) está resuelta en 6 de 7 sub-tabs con serie temporal. Quedan 3 bugs críticos a tocar: EC1 (Balance disclaimer), EC2 (Inicio tabla), EC3 (P&L tabla completa).

---

## E6. Roadmap de correcciones del tab EEFF

### Sprint EEFF-1: 3 fixes críticos restantes (~3 horas)
1. **EC1:** Añadir disclaimer visible en Balance + opacity en filter bar cuando activeSection==='balance'.
2. **EC2:** Hacer `ini-resumen-body` responsivo a `ffAnn(y)` + recalcular deltas con `ffCompareInfo`.
3. **EC3:** Reemplazar filter de tabla P&L para usar `ffCompareInfo().months`.

### Sprint EEFF-2: HIGH priority (~6 horas)
1. **EC5:** Renombrar FCO Estimado → EBITDA (proxy FCO) + nuevo KPI FCO ajustado.
2. **EH2:** Accordion de charts P&L en móvil + mobile cards para tabla.
3. **EH4:** Click-through desde chart de Ingresos P&L hacia breakdown comercial (modal).

### Sprint EEFF-3: MEDIUM + LOW polish (~8 horas)
1. **EM1:** Sparklines en tabla Anual.
2. **EM2:** Unificar labels bajo `label26()`.
3. **EM3:** Tooltips con comparación año-anterior inline.
4. **EM4:** Peor/Mejor mes dinámico.
5. **EM5:** Scroll indicators en tablas.
6. **EH1:** Presets de escenario en Simulador de Balance.
7. LOW: tokens CSS, badges clickables, insight toggles.

### Sprint EEFF-4: Modernización Tableau/Power BI (~2 semanas)
1. **EH5:** Rediseño de KPIs con delta visual fuerte.
2. Cross-filtering entre sub-tabs (click en mes → filtra el filtro global).
3. Annotation layer: marcar picos/caídas automáticamente (Sep-25 EBITDA –$447M, etc.).
4. Export a PDF del sub-tab actual para enviar al contador.

---

## E7. Conclusión del audit EEFF

El tab Financiero **ya tiene mejor comparabilidad lógica que el Comercial** — porque `ytd26_eeff` + `ffAnn` estaban bien diseñados desde el origen. Los commits de hoy consolidaron el modelo mental (compareMode) y alinearon los ejes X.

**Problemas reales que persisten:** (a) Balance es static y confunde cuando filtros no responden, (b) 2 tablas (Inicio y P&L) todavía hacen su propia lógica de filtrado ignorando `ffCompareInfo`, (c) nomenclatura "FCO Estimado" es técnicamente incorrecta.

Arreglando esos 3 bugs críticos (~3 horas de trabajo), el tab EEFF queda al nivel de un dashboard de CFO externo — Daniel puede sentarse con el contador y proyectar el Panel 360° como fuente de verdad sin que lo corrijan.

**Recomendación inmediata:** Sprint EEFF-1 antes de cualquier otro trabajo en el dashboard.
