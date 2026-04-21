# AUDIT REPORT — Panel 360° OET (Oftalmólogos El Tesoro)

**Fecha:** 2026-04-20
**Líneas de código analizadas:** ~4,320
**Stack:** HTML + CSS + JS vanilla, Chart.js v3, integración Google Sheets
**Contexto de uso:** Dashboard single-file desplegado en GitHub Pages. Daniel lo revisa primariamente desde **iPhone vertical (375×667)**. El cliente (oftalmólogos) también lo consulta desde móvil entre consulta y consulta.

**Marcos de referencia aplicados:**
- `dashboard-design` SKILL.md — principios Tufte, Stephen Few, Cleveland & McGill, Nussbaumer Knaflic.
- `responsive-mobile-web` SKILL.md — patrones mobile-first, touch targets 44px, layout fluido.

---

## 1. Resumen ejecutivo

1. **Dashboard funciona bien en desktop pero está roto en móvil.** Los 3 problemas críticos — pie charts sin data labels, filtros que ocupan 40% del viewport, y altura fija de 185px en gráficas — generan fricción inmediata en iPhone vertical. Daniel los ve a diario, el cliente también.

2. **Comparabilidad YTD está bien resuelta en lógica (el toggle Auto/YTD/Full recién desplegado funciona), pero visualmente inconsistente.** Cuando hay filtro mensual manual, las etiquetas siguen diciendo "YTD Ene–DD Abr" en vez de reflejar el rango elegido. Riesgo de decisión con datos malinterpretados.

3. **Densidad cruda sin storytelling.** 20+ gráficas y 30+ KPIs apilados en scroll vertical. Falta jerarquía F/Z clara, progressive disclosure (accordions, drill-down), y annotations en picos/caídas. El cliente no sabe dónde mirar primero.

4. **Accesibilidad WCAG AA NO pasa.** Touch targets <44px, sin `aria-label` en botones, colores rojo/verde sin refuerzo con símbolo, tipografía sin `tabular-nums`. 8% de usuarios hombres daltónicos no pueden leer deltas.

5. **Cero modernización estilo Tableau/Power BI.** No hay cross-filtering (clicar en una barra para filtrar el resto), drill-down jerárquico, annotations, ni skeleton loaders. Oportunidad grande para subir percepción de valor.

---

## 2. Hallazgos CRÍTICOS (bloquean usabilidad — arreglar primero)

### C1 — Pie/doughnut charts ilegibles sin data labels

**Problema:** Las 2 gráficas doughnut (`ch-com-pie`, `ch-com-pie26`, ~líneas 2918–2941) muestran solo la leyenda en `position:'right'`. En 375px de ancho, la leyenda se apila vertical y cada slice se vuelve un mini-pixel. Sin labels de % directos en los slices, el usuario no puede leer composición.

**Impacto:** Fallo de usabilidad nivel 1. Daniel no puede interpretar mix de líneas sin zoom + panning.

**Evidencia:** Líneas 2918–2941 (doughnut config), sin `plugins.datalabels`.

**Solución:**
1. **Opción A (mínima):** Activar `chartjs-plugin-datalabels`, mostrar % centrado en cada slice.
2. **Opción B (recomendada por skill dashboard-design § 3):** Reemplazar por **barra horizontal ordenada** — Cleveland & McGill demuestra que es más precisa para comparar valores. Pie charts solo justificables con ≤3 slices.

---

### C2 — Filtros ocupan 40% del viewport móvil

**Problema:** `#com-filter-bar` / `#fin-filter-bar` (~líneas 307–405) tienen 6-7 grupos (años, meses, cuartos, periodo, compareMode, doctores, tipo, línea). En móvil se desbordan a 3-4 filas, consumiendo 120-150px de alto de un viewport de 667px.

**Impacto:** Viola explícitamente `responsive-mobile-web` § 9: "filtros nunca >15% del viewport". El contenido útil queda empujado fuera del above-the-fold.

**Evidencia:** Media query `@media(max-width:767px)` reduce paddings pero no colapsa la barra.

**Solución — Filter Drawer pattern (Material Design):**
```html
<button id="mobile-filter-btn" aria-label="Abrir filtros">
  ⚙ Filtros <span class="badge" id="filter-count">3</span>
</button>
<aside class="filter-drawer" role="dialog" aria-modal="true">
  <!-- secciones: Período | Años | Comparativa | Métrica -->
  <div class="drawer-actions sticky">
    <button>Limpiar</button>
    <button class="primary">Aplicar</button>
  </div>
</aside>
```
- En <768px: icono de filtros con badge contador → abre bottom sheet/drawer.
- En ≥768px: mantener barra horizontal actual.
- Chips de filtros activos siempre visibles compactos: "2026 · Ene–Abr · YTD · Dr. Pérez".

---

### C3 — Alturas de gráficas fijas en 185px rompen legibilidad móvil

**Problema:** Línea ~278: `.chart-wrap{height:185px !important;}` en móvil. Las barras verticales se ven como pixels, ticks se superponen, tooltips ilegibles.

**Impacto:** Las gráficas son el 40% del valor del dashboard. Si no se leen en el dispositivo principal, el tablero pierde su razón de ser.

**Evidencia:** Línea 278 + `aspectRatio` de Chart.js no es dinámico.

**Solución:**
```css
.chart-wrap { height: clamp(240px, 50vh, 420px); }
```
```js
// En cada chart config
options: {
  responsive: true,
  maintainAspectRatio: false,
  aspectRatio: window.innerWidth < 640 ? 1.3 : 2,
  // re-render al rotar pantalla:
}
window.addEventListener('resize', _.debounce(() => {
  charts.forEach(c => c.resize());
}, 200));
```

---

### C4 — Comparabilidad rota cuando se filtran meses manualmente

**Problema:** El sistema YTD funciona bien sin filtro mensual (el toggle compareMode se aplica correctamente). Pero cuando el usuario selecciona "Ene + Feb" manualmente:
- Los datos sí se filtran a Ene-Feb de todos los años → matemáticamente correcto ✓
- **Las etiquetas siguen diciendo "YTD Ene–20 Abr"** → visualmente mentira ✗

**Impacto:** Daniel filtra a marzo, ve título "YTD Ene–20 Abr" y concluye mal. Riesgo de decisión con datos malinterpretados.

**Evidencia:**
- `ytdBadgeText()` en ~línea 1002 devuelve "YTD Ene–DD Mmm" basándose en `MTD_RAW`, no en filtros.
- `_lblSufCi` y sufijos similares se concatenan sin chequear `CF.months.size`.
- `ffYtd26Label()` (~línea 1536) tampoco valida filtro manual.

**Solución:** Centralizar en una función única:
```js
function getPeriodLabel(year){
  if(CF.months.size > 0){
    const arr = Array.from(CF.months).sort((a,b)=>a-b);
    const MN=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const first = MN[arr[0]-1], last = MN[arr[arr.length-1]-1];
    return arr.length===1 ? `${year} ${first}` : `${year} ${first}–${last}`;
  }
  const info = cfCompareInfo();
  if(info.mode==='full') return `${year}`;
  if(info.mode==='ytd'){
    const cur = MTD_RAW;
    const MN=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${year} YTD Ene–${cur.d} ${MN[cur.m-1]}`;
  }
  return `${year}`;
}
```
Refactorizar todas las labels de charts (`ch-com-yoy`, `ch-ebitda-full`, títulos de pie, etc.) para usar esta función única.

---

### C5 — Touch targets <44px violan WCAG 2.1 AA

**Problema:** `.cfb-pill` (~línea 334) tiene `padding:3px 11px; font-size:11px` → altura ~20px. `.cfb-month-pill` (~línea 349) aún más pequeño (~16px). Material Design exige 44-48px; WCAG 2.1 AA exige 44×44px CSS pixels.

**Impacto:** En iPhone con pulgar, el usuario toca el filtro equivocado regularmente. Finger slip constante.

**Solución:**
```css
.cfb-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 14px;
  min-height: 44px;
  min-width: 44px;
  gap: 6px;
}
@media (min-width: 768px){
  .cfb-pill { min-height: 32px; padding: 6px 10px; } /* desktop puede ser más compacto */
}
```
Gap mínimo 8px entre pills (actualmente 4-5px).

---

## 3. Hallazgos HIGH (afectan experiencia, no bloqueantes)

### H1 — Etiquetas de años inconsistentes

Hay al menos 4 variantes de la misma idea: `"2026"`, `"YTD '26"`, `"2026 YTD"`, `"2026 EEFF"`. Búsqueda por `2026` en el código arroja 50+ variantes. Causa confusión visual.

**Fix:** Crear constantes en un solo lugar:
```js
const YR = { Y24:'2024', Y25:'2025', Y26:'2026' };
function lblYr(y){ return getPeriodLabel(y); } // sección 2.C4
```

---

### H2 — Sin skeleton loaders al cambiar filtros

Al tocar un filtro, el recálculo puede tomar 300-600ms en 4G móvil. Sin feedback visual, se percibe como congelado. `document.body.style.overflow='hidden'` (~línea 1147) no es feedback útil.

**Fix:** Skeleton CSS + reemplazo temporal de cada `.chart-wrap` mientras se recalcula:
```css
.skeleton-chart {
  height: clamp(240px,50vh,420px);
  background: linear-gradient(90deg,
    rgba(255,255,255,0.03) 0%,
    rgba(255,255,255,0.08) 50%,
    rgba(255,255,255,0.03) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
```

---

### H3 — Leyenda `position:'right'` en donuts rompe móvil

En pie/doughnut el legend derecho consume 30-40% del ancho horizontal en 375px. Resultado: chart diminuto.

**Fix:**
```js
legend: {
  position: window.innerWidth > 640 ? 'right' : 'bottom',
  labels: { font: { size: window.innerWidth > 640 ? 11 : 9 }, boxWidth: 10 }
}
```

---

### H4 — Accesibilidad ARIA ausente

Todos los botones (~líneas 586–710) usan solo `title="..."`. No hay `aria-label`, `role`, `aria-pressed` en toggle buttons. Screen readers no pueden navegar.

**Fix:** Añadir `aria-label` descriptivo, `aria-pressed="true|false"` en togglables, `role="tablist"` en la barra de tabs.

---

### H5 — Tablas con scroll horizontal en móvil

Líneas ~2002–2051: `<table style="min-width:900px">` dentro de `.tbl-wrap`. En 375px obliga a scroll horizontal → UX pésima para datos financieros.

**Fix — patrón tabla → cards (responsive-mobile-web § 8):**
```css
@media (max-width: 639px){
  .tbl, .tbl thead, .tbl tbody, .tbl tr, .tbl td, .tbl th { display:block; }
  .tbl thead { display:none; }
  .tbl tr { border:1px solid rgba(255,255,255,.08); border-radius:8px; padding:12px; margin-bottom:8px; }
  .tbl td { display:flex; justify-content:space-between; padding:4px 0; border:0; }
  .tbl td::before { content: attr(data-label); font-weight:600; opacity:.7; }
}
```
HTML requiere `<td data-label="Concepto">...</td>` en cada celda.

---

## 4. Hallazgos MEDIUM (oportunidades claras)

### M1 — Data labels ausentes en barras

`ch-com-yoy`, `ch-ebitda-full` y otras barras (~líneas 2995–3010, 2128–2130) no muestran el valor exacto; obligan a hover/tap para leer. Reduce eficiencia de escaneo.

**Fix:** Activar `datalabels` plugin o usar ticks callback con valor en la barra.

---

### M2 — Colores sin refuerzo visual para daltónicos

`--neg` (rojo) y verde positivo se usan sin símbolos (↑↓). 8% hombres daltónicos no pueden distinguir.

**Fix:** Siempre combinar color + símbolo. Ej: `↑ $45K (12.3%)` en verde, `↓ $8K (2.1%)` en rojo. Probar con DevTools → Rendering → Emulate vision deficiency.

---

### M3 — Botón de expandir gráfica con touch target pobre

`.card-expand-btn` (~líneas 436–451) puede quedar tapado por notch y no cumple 44×44.

**Fix:**
```css
.card-expand-btn {
  min-height: 44px; min-width: 44px;
  margin-right: env(safe-area-inset-right, 0);
}
```

---

### M4 — Sin drill-down temporal (día/semana)

El dashboard agrupa por mes como mínimo granularidad. No puedes investigar "¿por qué cayó la semana del 15 de marzo?".

**Fix:** Agregar nivel semanal y diario cuando haya datos. Breadcrumbs al hacer drill: "2026 › Marzo › Semana 3 › Día 15".

---

### M5 — Sin comparación vs meta / presupuesto

KPIs muestran delta vs período anterior. No hay referencia de meta. ¿12% de crecimiento es bueno o la meta era 20%?

**Fix:** Inputs de meta anual/mensual (o formula) + línea de meta en cada gráfica + color del KPI según cumplimiento (verde ≥100%, ámbar 80-99%, rojo <80%).

---

## 5. Hallazgos LOW (polish / nice-to-have)

- **L1** — Tipografía con 3+ media queries; simplificar con `clamp()` (responsive-mobile-web § 5).
- **L2** — Falta `font-variant-numeric: tabular-nums` en `.kpi-val` y `.tbl td`. Números oscilan en ancho y rompen alineación.
- **L3** — Tabs de Comercial/EEFF/Acciones NO lazy-loadean gráficas; todas se construyen al cargar. En 4G móvil es innecesario.
- **L4** — Transiciones abruptas al cambiar filtro (sin `transition: opacity 250ms ease-out`).
- **L5** — Emojis inconsistentes en insight boxes (⭐📅📈 usados en algunos pero no todos); estandarizar o usar SVG inline.

---

## 6. Mobile audit específico — iPhone vertical (375×667)

### Viewport
- ✓ Viewport meta tag existe.
- ✗ **Falta `viewport-fit=cover`** → contenido no llega al notch; padding safe-area parcial.

### Layout en 375px

| Elemento | Ancho / Alto esperado | Real | Estado |
|---|---|---|---|
| Header | 375 × 56 | OK | ✓ |
| Filtros | <15% viewport (≤100px) | 120-150px (3+ filas) | ✗ CRÍTICO |
| KPIs k3 | 3 columnas | 2 columnas apretadas | ⚠ OK-ish |
| Chart area | altura fluida | fija 185px | ✗ CRÍTICO |
| Tablas | fluidas o cards | min-width:900 + scroll H | ✗ HIGH |

### Touch targets
- ✗ `.cfb-pill` ~20px alto (debe ser 44px).
- ✓ `.bnav-btn` ~60px (OK).
- ⚠ `.tbl` rows ~16px (aceptable solo por densidad informacional).

### Chart.js config móvil
- ✓ `responsive:true` presente en la mayoría.
- ✗ `maintainAspectRatio:false` no siempre.
- ✗ `aspectRatio` no dinámico.
- ✗ No hay `ticks.maxRotation:45` ni `autoSkip` con `maxTicksLimit` reducido en móvil.
- ✗ `legend.position` fijo → falla en donuts.

### Safe area
- ✓ Línea ~200: `padding-bottom:env(safe-area-inset-bottom)` presente.
- ✗ Falta `padding-left/right` para landscape notch.

---

## 7. Inconsistencias de comparabilidad pendientes

1. **Labels "YTD 2026" se muestran incluso con filtro mensual manual** (ver C4).
2. **MTD badge solo aparece con `CF.period==='mtd'`** — en modo YTD con abril parcial, no indica que abril es parcial. Confusión.
3. **Bases de datos COM vs FIN divergentes** — COM usa Google Sheets en tiempo real; FIN depende de upload manual (~día 15). En los primeros 15 días del mes hay desfase no comunicado al cliente.
   - **Fix:** Banner "⚠ Datos EEFF pendientes de cierre contable del mes en curso" cuando `D.eeffPending === true`.

---

## 8. Oportunidades de modernización (Tableau / Power BI)

### Patrón 1 — Cross-filtering
**Qué falta:** Clicar una barra de cirujano debería filtrar el resto del dashboard por ese cirujano. Actualmente las gráficas son puramente display.
```js
chart.options.onClick = (e, els) => {
  if(els[0]){
    const val = chart.data.labels[els[0].index];
    setComDoctor(val); // toggle filter
    redrawAll();
  }
};
```

### Patrón 2 — Drill-down jerárquico con breadcrumbs
Año → Mes → Semana → Día. En móvil, modal full-screen con breadcrumb sticky arriba.

### Patrón 3 — Annotations en eventos clave
JSON global con eventos (campañas, feriados, incidentes):
```js
const ANN = [
  { date:'2025-07', label:'Campaña estival', value:1200000 },
  { date:'2025-12', label:'Bonus fin año',   value:1800000 },
  { date:'2026-02', label:'San Valentín',    value:950000 }
];
// Plugin annotation de Chart.js renderiza estas marcas en gráficas temporales
```

### Patrón 4 — Tooltips enriquecidos con contexto
En vez de solo valor, incluir:
- Valor absoluto + delta vs año anterior + % cumplimiento meta.
- "Click para ver detalle" si el elemento es drillable.

### Patrón 5 — What-if / scenario inputs
Slider simple "¿Qué pasa si subo precio de cirugía 5%?" → recalcula proyección. Es el feature que Daniel puede mostrar al cliente para subir la percepción de valor 10x.

---

## 9. Roadmap priorizado

### Sprint 1 (AHORA — show-stoppers móvil)
1. **C1** Pie charts con data labels (o reemplazo por barras horizontales).
2. **C2** Filter drawer en <768px.
3. **C3** Alturas fluidas con `clamp()` + `aspectRatio` dinámico.

### Sprint 2 (esta semana)
4. **C4** Refactor de labels de período → función `getPeriodLabel()` única.
5. **C5** Touch targets 44px mínimo.
6. **H2** Skeleton loaders.
7. **H4** ARIA labels + `aria-pressed`.

### Sprint 3 (2 semanas)
8. **H5** Tabla → cards en móvil.
9. **H1** Constantes centralizadas de etiquetas.
10. **M2** Deltas con símbolo + color (daltonismo).
11. **L3** Lazy-load de tabs invisibles.

### Sprint 4 (modernización — levanta percepción de valor)
12. Cross-filtering (clic en barra → filtra).
13. Drill-down año → mes → semana → día.
14. Annotations en picos/campañas.
15. Comparación vs meta/presupuesto.
16. Tooltips enriquecidos.
17. (Stretch) What-if scenario sliders.

---

## 10. Anexo — líneas clave para cada fix

| Problema | Líneas aprox | Acción |
|---|---|---|
| C1 Pie sin labels | 2918–2941 | `datalabels` plugin o reemplazar |
| C2 Filtros móvil | 307–405, 232–305 | Refactor a drawer |
| C3 Chart heights | 278, 3509 | `clamp()` + aspect dinámico |
| C4 YTD labels | 1002, 1536–1610, 2029, 2085 | `getPeriodLabel()` |
| C5 Touch targets | 332–350 | `min-height:44px` |
| H2 Skeletons | 1147–1180 | CSS shimmer + reemplazo temporal |
| H4 ARIA | 586–710 | `aria-label`, `aria-pressed` |
| H5 Tablas móvil | 2002–2051 | CSS cards + `data-label` |
| L2 tabular-nums | 237–305 | `.kpi-val{font-variant-numeric:tabular-nums}` |

---

## Conclusión

El dashboard **es funcional pero no cumple el estándar de clase mundial que Daniel quiere proyectar al cliente**. Los tres fixes críticos de Sprint 1 (pie labels, filter drawer, chart heights) transforman la experiencia móvil en una sola tarde. Los fixes HIGH cierran la brecha de accesibilidad y consistencia. Los MEDIUM/LOW son pulido. Y las modernizaciones del Sprint 4 (cross-filter, drill-down, annotations, what-if) son donde Daniel se diferencia de cualquier consultor que entregue "un tablero bonito" — estos patrones generan percepción de software profesional tipo Tableau/Power BI.

**Tiempo estimado total:** Sprint 1 = 1 día · Sprint 2 = 2-3 días · Sprint 3 = 3-4 días · Sprint 4 = 1-2 semanas.
