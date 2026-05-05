# CLAUDE.md — Panel 360° · Oftalmólogos El Tesoro

**Proyecto:** OET Dashboard · Panel de Business Intelligence  
**Operado por:** Daniel Mesa · CFO Externo / Asesor Estratégico  
**Producción:** https://clawddma.github.io/oet-dashboard/  
**Repositorio:** https://github.com/clawddma/oet-dashboard  
**Última actualización CLAUDE.md:** 2026-05-04

---

## 1. CONTEXTO DEL NEGOCIO

**OET (Oftalmólogos El Tesoro)** es una clínica oftalmológica de alta especialidad en Medellín. Daniel Mesa es el asesor estratégico / CFO externo que construye y mantiene este panel para los socios.

### Cuerpo Médico (10 cirujanos activos 2026)
| # | Médico | Especialidad | Nota |
|---|--------|-------------|------|
| 1 | Dr. Miguel Antonio Jaramillo Noguera | Catarata · LIO Premium | Líder facturación |
| 2 | Dr. Jon Kepa Balparda | Catarata (alto volumen) | Líder volumen cirugías |
| 3 | Dr. Miguel Jaramillo Martínez | Vitreoretina · Catarata | |
| 4 | Dr. Jorge Emilio Jaramillo Noguera | — | Retirado 2025 |
| 5 | Dr. Jorge Alejandro Jaramillo Henríquez | Catarata · Córnea | |
| 6 | Dr. Juan Gonzalo Sánchez Montoya | Glaucoma · Catarata | |
| 7 | Dr. Boris Arturo Ramírez Serafinoff | Catarata · Refractiva | |
| 8 | Dr. José Agustín Jaramillo Sola | LIO · Córnea | |
| 9 | Dr. Juan Carlos Gil Muñoz | Catarata | |
| 10 | Dra. Carolina Sardi Correa | Refractiva | |

### Líneas de Servicio
1. **D. Sala (Cirugías)** — Derechos de sala quirúrgica
2. **Honorarios Cirujano** — Honorarios médicos
3. **LIOs ★** — Lentes intraoculares premium (mayor margen)
4. **Consultas Médicas**
5. **Exámenes Diagnóstico**
6. **Medicamentos**

### Objetivos del Panel
1. Medir evolución del negocio mes a mes y año vs. año
2. Identificar oportunidades de optimización por línea de servicio
3. Seguimiento por médico (facturación y volumen)
4. Monitorear salud financiera (P&L, EBITDA, márgenes, balance)
5. Reportar iniciativas estratégicas 2026

---

## 2. ARQUITECTURA DEL SISTEMA

```
Google Sheets (facturación) ──30min──► Apps Script (oet_autosync.gs)
                                                  │
                                         GitHub API (PUT index.html)
                                                  │
                                     GitHub Repo (clawddma/oet-dashboard)
                                                  │
                                         GitHub Pages (auto-deploy)
                                                  │
                           ┌──────────────────────┤
                           ▼                      ▼
                    Socios OET              Daniel Mesa
                    (móvil/desktop)         (control + edición)
```

**Fuentes de datos:**
- **Tab Financiero** → array `D[]` (EEFF oficial del contador, actualizado ~día 15 de cada mes por Daniel)
- **Tab Comercial** → objetos `COM`, `CIR`, `MTD_RAW` (facturación real desde Google Sheets, auto-sync 30 min)
- **Tab Acciones 2026** → datos internos manuales

---

## 3. STACK TÉCNICO

- **Frontend:** HTML5 + Vanilla JavaScript (sin frameworks) + Chart.js v3
- **Datos:** Arrays y objetos JavaScript inline en `index.html`
- **Hosting:** GitHub Pages (auto-deploy en cada commit a `main`)
- **Auto-sync:** Google Apps Script → GitHub API PUT
- **Sin backend, sin base de datos, sin login**

### Archivo principal
`index.html` — archivo único de ~4,100 líneas. Contiene todo: HTML, CSS (inline), JS.

### Correr localmente
```bash
cd /Users/braindma/Desktop/OET/oet-dashboard
python -m http.server 8000
# Abrir http://localhost:8000
```

---

## 4. MODELO DE DATOS

### 4.1 Array `D[]` — Estados Financieros Oficiales (EEFF)
Fuente: contador OET. Daniel lo actualiza manualmente cada ~día 15.

```javascript
// Un objeto por mes:
{
  p: 'Mar-26',      // etiqueta del período
  f: '2026-03',     // fecha año-mes
  y: 2026, m: 3,    // año y mes
  ing: 1658337,     // ingresos (miles COP)
  cost: ...,        // costos directos
  ub: ...,          // utilidad bruta
  mbp: ...,         // margen bruto %
  ga: ..., go: ..., // G&A y gastos operacionales
  da: ...,          // depreciación y amortización
  uo: ..., mop: ...,// utilidad operacional y %
  oInc: ..., oGas: ...,
  un: ..., mnp: ...,// utilidad neta y %
  ebitda: ...,
  mep: ...,         // margen EBITDA %
  eeffPending: true // si solo tiene `ing` (EEFF aún no llegan)
}
```

**Cobertura actual:** Ene-24 a Feb-26 completos + Mar-26 con solo `ing` (eeffPending: true)

### 4.2 Objeto `COM` — Datos Comerciales
```javascript
COM = {
  lineas: ['D.Sala (Cirugías)', 'Honorarios Cirujano', 'LIOs ★',
           'Consultas Médicas', 'Exámenes Diagnóstico', 'Medicamentos'],
  v24: [...], v25: [...], v26: [...],    // totales anuales por línea
  ing_m24: [...], ing_m25: [...], ing_m26: [...], // ingresos mensuales
  pct25: [...],
  cirugias: { v24, v25, v26, pct },
  pacientes: { v24, v25, pct },
  meta26: 23500000   // meta facturación 2026 (miles COP)
}
```

### 4.3 Objeto `CIR` — Cirujanos y Procedimientos
```javascript
CIR = {
  cirujanos: [{ name, sheetName, bill24, bill25, bill26, cir24, cir25, cir26, esp }, ...],
  tipos: ['Catarata', 'LIOs Premium', 'PRK', 'LASIK', 'Vitrectomía', ...],
  tipos_v24: [...], tipos_v25: [...], tipos_v26: [...],
  mes_labels: [...], mes_24: [...], mes_25: [...], mes_26: [...]
}
```

### 4.4 Objeto `MTD_RAW` — Mes a la Fecha
```javascript
MTD_RAW = {
  y: 2026, m: 4, d: 20, daysInMonth: 30,
  ing: 1017577,
  cir: 284,
  lineas: [...],
  cirujanos: [{ name, bill, cir }, ...]
}
```

### 4.5 Marcadores de Auto-sync (NO EDITAR)
Los campos entre estos marcadores son sobrescritos automáticamente cada 30 min:
- `/* ==OET_DATA_START== */` ... `/* ==OET_DATA_END== */`
- `// ==MTD_DATA_START==` ... `// ==MTD_DATA_END==`
- Cualquier campo con comentario `/* AUTO */`

**Sí se puede editar manualmente:** el array `D[]` (EEFF).

---

## 5. REGLAS INAMOVIBLES

1. **NUNCA mezclar fuentes de datos en la misma gráfica:**
   - Tab Financiero → solo `D[]` (EEFF oficial del contador)
   - Tab Comercial → solo `COM.ing_mXX` (Google Sheets)
   - Si discrepan, explicar la diferencia. No "corregir" ninguno.

2. **NUNCA editar campos `/* AUTO */`** — el próximo auto-sync los sobreescribe en minutos.

3. **NUNCA hacer `git push` sin `git pull --rebase` previo.** El auto-sync hace commits cada 30 min.

4. **NUNCA usar `new Chart()` directo** — siempre `mkChart()` (aplica BASE_OPTS y registra en `_chartReg`).

5. **NUNCA usar `borderRadius: {topLeft: 3, topRight: 3}`** — rompe todas las barras. Usar `borderRadius: 3`.

6. **NUNCA omitir `requestAnimationFrame(resize)`** al final de `buildXxx()` — sin esto el canvas queda 0×0.

7. **NUNCA destruir instancias Chart sin que Daniel lo solicite explícitamente.**

8. **NUNCA hacer cambios no solicitados** — solo modificar exactamente lo pedido.

9. **NUNCA romper el auto-sync** — los marcadores `==OET_DATA_START==` deben permanecer intactos.

10. **SIEMPRE verificar en producción con cache-bust:** `?v=YYYY-MM-DD` en la URL.

---

## 6. FLUJO DE TRABAJO (GIT)

```bash
# 1. Siempre sincronizar primero
cd /Users/braindma/Desktop/OET/oet-dashboard
git pull --rebase origin main

# 2. Hacer los cambios en index.html

# 3. Commit con descripción clara
git add index.html
git commit -m "tipo(scope): descripción corta del cambio"

# 4. CRITICAL: pull de nuevo antes de push (auto-sync pudo haber commiteado)
git pull --rebase origin main

# 5. Push
git push origin main

# 6. Verificar en producción
# https://clawddma.github.io/oet-dashboard/?v=2026-XX-XX
```

### Convenciones de commit
- `feat(fin): agrega módulo balance Q1-26`
- `fix(com): corrige cálculo YTD cirujanos`
- `data(eeff): inyecta EEFF marzo 2026`
- `style(ui): mejora cards KPI financiero`

---

## 7. ESTRUCTURA DE ARCHIVOS (REPOSITORIO)

```
oet-dashboard/
├── index.html              ← DASHBOARD PRINCIPAL (toda la app)
├── oet_autosync.gs         ← Google Apps Script (referencia)
├── panel_financiero_oet.html ← Snapshot local del dashboard
├── AUDIT_EEFF_2026-04-20.md
├── AUDIT_REPORT_2026-04-20.md
└── CLAUDE.md               ← Este archivo
```

### Estructura local completa (Desktop/OET)
```
/Users/braindma/Desktop/OET/
├── oet-dashboard/          ← REPO GIT (código producción) ← aquí trabajamos
├── 01_Panel_360/           ← Archivos locales previos
├── 02_EEFF/                ← Estados financieros (Excel + CSV)
├── 03_Datos_Comerciales/   ← Datos ventas y facturación
├── 04_Reportes/            ← Reportes para clientes e internos
├── 05_Presentaciones/      ← PDFs y HTMLs ejecutivos
├── 06_Skills_Automatizaciones/ ← Scripts y skills instaladas
├── 07_Backups_Historicos/  ← Versiones anteriores del dashboard
├── 08_Referencia/          ← Pantallazos Zoho Analytics
├── oet-backups/            ← Backups diarios automáticos (5 más recientes)
└── DOCUMENTO_MAESTRO_OET.md ← Documentación maestra completa
```

---

## 8. SISTEMA DE DISEÑO — ESTÁNDARES DE CLASE MUNDIAL

### 8.1 Filosofía de Diseño

El Panel 360° OET no es un reporte corporativo genérico. Es una **herramienta de toma de decisiones de alta precisión** para un equipo médico directivo. Cada elemento visual debe:

- **Servir un propósito narrativo:** no hay gráfica sin insight accionable
- **Reducir la carga cognitiva:** el CEO debe entender en 3 segundos, el analista en 30
- **Priorizar la jerarquía de información:** KPIs críticos → contexto → detalle
- **Hablar con datos, no con decoración:** cada pixel justificado

### 8.2 Paleta de Colores

| Uso | Color | Hex / RGBA |
|-----|-------|-----------|
| Header / navbar | Verde oscuro | `#1a3a2a` / `#0d2e28` |
| Primario 2025 | Teal | `#2dc5ab` / `rgba(45,197,171,X)` |
| Primario 2026 | Dorado | `#ffc107` / `rgba(255,193,7,X)` |
| Primario 2024 | Azul | `rgba(68,108,179,X)` |
| Positivo | Verde teal | `#2dc5ab` |
| Negativo | Rojo | `#ef5350` |
| Alerta | Naranja | `#ff9800` |
| Texto secundario | Gris verde | `#607d76` |
| Fondo | Gris suave | `#eef2f1` |
| Cards | Blanco | `#fafaf9` |
| Cero line | Naranja punteado | `rgba(255,152,0,0.6)` |

**Regla:** El mismo año siempre lleva el mismo color en todas las vistas. Nunca invertir.

### 8.3 Tipografía

- **Fuente:** System UI (sans-serif del SO — máxima legibilidad, cero carga)
- **Jerarquía:**
  - 10px — ejes y ticks de gráficas
  - 11px — labels y leyendas
  - 12px — títulos de gráficas
  - 14-16px — KPIs secundarios
  - 20-24px — KPIs principales
  - 28-32px — cifras headline (facturación, EBITDA)

### 8.4 Componentes UI

**KPI Card:**
```
┌─────────────────────────────┐
│ ETIQUETA                    │
│ $2.0B          +57.1% '24  │
│ ─────────────────           │
│ Contexto adicional          │
└─────────────────────────────┘
```
- `border-radius: 12px`
- `box-shadow: 0 2px 8px rgba(0,0,0,0.06)`
- Borde izquierdo de color (4px) para categoría

**Chart Card:**
```
┌─ Título ─────── Badge ─ [↗] ┐
│                              │
│   [Canvas Chart.js]          │
│                              │
│ 💡 Insight accionable        │
└──────────────────────────────┘
```
- Header separado con fondo sutil
- Botón expand para modal fullscreen
- Footer con insight en lenguaje de negocio

**Tabla Comparativa:**
- Encabezados con año coloreado (azul/teal/dorado)
- Variaciones: verde si positivo, rojo si negativo
- Formato miles COP: `$12.5M`, `$234K`

### 8.5 Principios UX de Clase Mundial

**1. Respuesta inmediata**
Todo debe renderizar en <300ms. El lazy loading ya está implementado (secciones se construyen al navegar).

**2. Feedback visual en cada interacción**
- Botones: estado active/hover diferenciado
- Filtros seleccionados: fondo de color, borde marcado
- Carga de sección: transición suave

**3. Jerarquía clara de información**
- Primero los KPIs headline (lo más importante)
- Luego contexto histórico (gráficas de tendencia)
- Luego detalle (tablas, desglose por médico/línea)

**4. Tooltips accionables**
Cada punto en una gráfica debe mostrar: valor, período, variación vs. año anterior.

**5. Insight narrativo**
Cada sección termina con una caja de insight en español que traduce el dato en decisión:
- ❌ Mal: "EBITDA: $342M"
- ✅ Bien: "💡 El EBITDA de 2025 ($342M, 17.4%) superó el objetivo. Los meses críticos fueron Sep-Oct con margen bajo el 10%."

**6. Sin ruido visual**
- Sin bordes innecesarios
- Sin gradientes decorativos
- Sin animaciones que distraigan
- Cada elemento tiene propósito

**7. Consistencia absoluta**
- El mismo formato de número en toda la app (`fv()`)
- El mismo color para el mismo año en toda la app
- El mismo idioma (español) en toda la app

**8. Mobile-first thinking**
Aunque los usuarios principales usan desktop, los socios revisan en móvil. Responsive en <768px es crítico.

### 8.6 Inspiración — Mejores Prácticas BI

El diseño del panel está inspirado en las mejores prácticas de:

**Tableau:** Narrativa visual, contexto en cada vista, variaciones de color semánticas, focus en la historia del dato.

**Power BI:** Cards de KPI limpias, drill-down lógico, filtros persistentes.

**Zoho Analytics:** Simplicidad en la navegación, accesibilidad sin login.

**Financial Times / Bloomberg:** Formato de números preciso (M, B, K), gráficas de línea para tendencias, barras para comparaciones.

**McKinsey Reports:** Insights accionables sobre cada gráfica, jerarquía de información clara, uso medido del color.

### 8.7 Anti-patrones que NUNCA se deben hacer

- Gráficas de pie/donut para comparar más de 3 categorías
- Ejes Y que no empiezan en 0 (sin justificación explícita)
- Colores brillantes sin significado semántico
- Demasiadas líneas en una sola gráfica (máximo 4)
- Texto vertical en ejes (siempre horizontal o 45°)
- Tooltips sin formato de moneda COP
- Gráficas sin título ni contexto de período
- Secciones sin KPIs principales visibles al cargar

---

## 9. FUNCIONES CLAVE DEL CÓDIGO

### Helpers de Formato (utils)
```javascript
fv(v, decimals)  // Formatea valor: "$12.5M", "$234K"
fp(v)            // Formatea porcentaje: "+12.5%"
clr(v)           // Color dinámico: verde si positivo, rojo si negativo
pctVar(a, b)     // Variación porcentual
yr(y)            // Filtra D[] por año
hasEEFF(d)       // Verifica si mes tiene EEFF oficial (no eeffPending)
```

### Chart.js
```javascript
mkChart(id, cfg, el)   // SIEMPRE usar esto (nunca new Chart directo)
expandChart(id, title) // Abre modal fullscreen
BASE_OPTS              // Opciones base (responsive, tooltips, etc.)
```

### Build Functions
```javascript
// Financiero
buildFinInicio()   // KPIs generales + resumen histórico
buildFinPnl()      // Estado de Resultados mensual
buildFinEbitda()   // EBITDA mensual + tendencia
buildFinMargen()   // Márgenes bruto/operacional/neto
buildFinCostos()   // Desglose de costos
buildFinFlujo()    // Flujo de caja proxy
buildFinBalance()  // Balance sheet (snapshots)
buildFinAnual()    // Resumen anual comparativo

// Comercial
buildComInicio()     // KPIs comerciales + MTD
buildComLineas()     // Facturación por línea de servicio
buildComCirujanos()  // Performance médicos
buildComTrend()      // Tendencia mensual interanual
buildComMeta()       // Avance vs meta 2026 ($23,500M)

// Acciones 2026
buildAccInicio()  // Resumen iniciativas estratégicas
buildAccPlan()    // Roadmap por trimestre
buildAccKpi()     // KPIs de seguimiento
```

### Filtros
```javascript
CF = { years, months, doctors, tipo, linea, period }  // Comercial
FF = { years, months }  // Financiero
```

---

## 10. CÓMO INYECTAR NUEVOS EEFF

Cuando el contador entrega los estados financieros de un nuevo mes:

1. Localizar el último elemento del array `D[]` en `index.html`
2. Si el mes existía con `eeffPending: true`, **reemplazar** ese elemento completo
3. Si es un mes nuevo, **agregar** al final del array

**Formato del objeto:**
```javascript
{
  p: 'Mar-26', f: '2026-03', y: 2026, m: 3,
  ing: XXXX,      // ingresos en miles COP
  cost: XXXX,     // costos directos
  ub: XXXX,       // utilidad bruta (ing - cost)
  mbp: XX.X,      // margen bruto % ((ub/ing)*100)
  ga: XXXX,       // gastos administración
  go: XXXX,       // gastos operacionales (ga + otros)
  da: XXXX,       // depreciación y amortización
  uo: XXXX,       // utilidad operacional (ub - go - da)
  mop: XX.X,      // margen operacional %
  oInc: XXXX,     // otros ingresos
  oGas: XXXX,     // otros gastos
  un: XXXX,       // utilidad neta
  mnp: XX.X,      // margen neto %
  ebitda: XXXX,   // uo + da (o según metodología del contador)
  mep: XX.X,      // margen EBITDA %
}
// Sin eeffPending si los datos están completos
```

**Todas las cifras en MILES de pesos colombianos (COP).**

---

## 11. SISTEMA DE BACKUPS

**Automático (cada medianoche):** `oet-backup-midnight` guarda snapshot en `Desktop/OET/oet-backups/`

**Antes de cualquier cambio estructural:**
```bash
git tag backup-manual-$(date +%Y-%m-%d) HEAD
git push origin backup-manual-$(date +%Y-%m-%d)
```

**Restaurar versión anterior:**
```bash
git show backup-2026-04-20:index.html > index_recovered.html
```

---

## 12. ROADMAP DEL PROYECTO

### Completado (Q1–Q2 2026)
- [x] Inyección EEFF enero–marzo 2026 (Q1 cerrado)
- [x] YTD comparable en Tab Comercial — fix comparativas interanuales (2026-04-30)
- [x] Fix alerta "96h sin actualización" — `getSyncFreshness()` usa MTD_RAW como fuente primaria (2026-05-04)
- [x] Fix botón "↻ Actualizar" — `manualRefresh()` con `mode:'no-cors'` (2026-05-04)
- [x] Editor de actas + drag & drop + comentarios mensuales + gráfico CxC/CxP (2026-04-25)
- [x] Sistema de honorarios médicos integrado con filtros CF (2026-04-28)

### Activo (Q2 2026)
- [ ] Pegar paso 11b en Apps Script → escribir LAST_SYNC con timestamp preciso
- [ ] Revisar y promover cambios de staging.html (4 features STAGING-NEW)
- [ ] Mejoras visuales post-reunión cliente mayo 2026

### Corto plazo (Mayo–Junio 2026)
- [ ] Módulo de interacción / chat con el dashboard
- [ ] Integración `DAILY_RAW` — filtros "Hoy" y "Esta Semana"
- [ ] Dashboards individuales por médico

### Medio plazo (Q3 2026)
- [ ] Alertas automáticas WhatsApp (cumplimiento de metas)
- [ ] Proyecciones de facturación
- [ ] Integración con sistema ERP/EPS

### Largo plazo (2027+)
- [ ] App móvil nativa
- [ ] API pública para integración contable

### Documentos de análisis generados
| Documento | Fecha | Descripción |
|---|---|---|
| `OET_Diagnostico_Financiero_Q1_2026.docx` | 2026-05-04 | Diagnóstico financiero completo Q1-2026, 7 secciones + rubros atípicos |
| `PyG_Cirujanos_Q1_2025_vs_2026.docx` | 2026-05-04 | P&G por cirujano Q1-25 vs Q1-26, UB/cirugía |

---

## 13. CONTACTOS Y ACCESOS

| Recurso | Detalle |
|---------|---------|
| Dashboard producción | https://clawddma.github.io/oet-dashboard/ |
| Repositorio GitHub | https://github.com/clawddma/oet-dashboard |
| Google Sheet (privado) | Administración OET — no compartir |
| Apps Script | Vinculado al Google Sheet, edita Daniel |
| Backups locales | `/Users/braindma/Desktop/OET/oet-backups/` |
| Backups históricos | `/Users/braindma/Desktop/OET/07_Backups_Historicos/` |
| Documento Maestro | `/Users/braindma/Desktop/OET/DOCUMENTO_MAESTRO_OET.md` |

**Daniel Mesa:** danielmesar@hotmail.com · CFO externo · dueño del proyecto

---

## 14. PRINCIPIOS DE COLABORACIÓN CON DANIEL

- **Respuestas concisas:** Daniel conoce el proyecto. No explicar lo obvio.
- **Solo cambiar lo pedido:** nunca hacer cambios adicionales no solicitados.
- **Mostrar resultado, no proceso:** confirmar qué cambió y dónde verificarlo.
- **Antes de cambios grandes:** confirmar con Daniel el enfoque exacto.
- **Git primero:** siempre pull --rebase antes de cualquier edición.
- **Verificar producción:** después de cada push, confirmar que GitHub Pages desplegó correctamente.
- **Nunca inventar datos:** si un dato no está en el archivo, preguntar a Daniel.
- **Formato COP:** todas las cifras del negocio son en miles de pesos colombianos.
