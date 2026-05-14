/**
 * =====================================================================
 *  OET Dashboard — Auto-Sync con Google Sheets  v5.0
 * =====================================================================
 *  TRIGGERS INSTALADOS (ejecutar setupTriggers UNA VEZ):
 *    1. Diario a las 00:00 hora Colombia (medianoche)   → syncDashboard
 *    2. Cada 30 minutos durante el día                  → syncDashboard
 *    3. Si el sync falla → envía correo de alerta automático
 *
 *  Columnas clave en Hoja1 (índice 0-based):
 *    A (0)  = Fecha del servicio (Date) ← NUEVA: para DAILY_RAW
 *             ⚠️  Si la fecha está en otra columna, cambia COL.FECHA abajo
 *    C (2)  = Mes (1-12)
 *    D (3)  = Año (2024, 2025, 2026 — también "3026" por typo → 2026)
 *    M (12) = Tipo Producto
 *    Q (16) = Servicio (detalle por línea)
 *    R (17) = Cantidad (unidades por fila — usado para contar lentes en LIOs)
 *    V (21) = Valor Total (pesos COP)
 *    W (22) = Medico (nombre completo en mayúsculas)
 *
 *  Unidad del dashboard: miles de COP → dividir Valor Total / 1000
 *
 *  NOVEDADES v5.0:
 *    - Sync de MTD_RAW  → habilita vista "Mes a la Fecha" en el dashboard
 *    - Sync de DAILY_RAW → habilita filtros "Esta Semana" y "Hoy"
 * =====================================================================
 */

// ── Configuración ──────────────────────────────────────────────────────
var CFG = {
  sheetName:  'Hoja1',
  ghOwner:    'clawddma',
  ghRepo:     'oet-dashboard',
  ghFile:     'index.html',
  ghBranch:   'main',
  ghApi:      'https://api.github.com',
  timezone:   'America/Bogota',
  alertEmail: Session.getEffectiveUser().getEmail(),
  logSheet:   'SyncLog',
};

// Índices de columna (0-based, A=0 … W=22)
var COL = {
  FECHA:    0,   // ← Columna A: fecha del servicio (Date object)
                 //   Si la fecha está en otra columna, cambia este índice.
                 //   Ej: columna B = 1, columna E = 4
  MES:      2,
  ANO:      3,
  TIPO:     12,
  SERVICIO: 16,  // ← Columna Q: detalle del servicio
  CANTIDAD: 17,  // ← Columna R: unidades por fila (lentes implantados en filas LIOS)
  VALOR:    21,
  MEDICO:   22,
};

// Tipo Producto → índice en COM.lineas
var TIPO_IDX = {
  'DERECHOS SALA':          0,
  'HONORARIOS OFTALMOLOGO': 1,
  'LIOS':                   2,
  'CONSULTAS':              3,
  'EXAMENES':               4,
  'MEDICAMENTOS':           5,
};

var MES_NAMES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ── Función principal ──────────────────────────────────────────────────
function syncDashboard() {
  var t0  = Date.now();
  var now = new Date();
  var ts  = Utilities.formatDate(now, CFG.timezone, 'yyyy-MM-dd HH:mm');
  var log = [];

  function llog(msg) { Logger.log(msg); log.push(msg); }

  try {
    // 1. PAT de GitHub
    var props = PropertiesService.getScriptProperties();
    var ghPat = props.getProperty('GH_PAT');
    if (!ghPat) {
      throw new Error('GH_PAT no configurado. Ejecuta setGithubPAT() en el editor.');
    }

    // 2. Leer Hoja1 completa
    llog('📖 Leyendo ' + CFG.sheetName + '…');
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CFG.sheetName);
    if (!sheet) throw new Error('Hoja "' + CFG.sheetName + '" no encontrada.');

    var lastRow = sheet.getLastRow();
    // Leer hasta columna 23 (W=22 en 0-based) — suficiente para todos los campos
    var data = sheet.getRange(2, 1, lastRow - 1, 23).getValues();
    llog('   Filas leídas: ' + data.length);

    // 3. Acumuladores — COM/CIR (igual que v4)
    var years = [2024, 2025, 2026];
    var comSum   = { 2024:[0,0,0,0,0,0], 2025:[0,0,0,0,0,0], 2026:[0,0,0,0,0,0] };
    var cirCount = {};
    years.forEach(function(y) {
      cirCount[y] = {};
      for (var m = 1; m <= 12; m++) cirCount[y][m] = 0;
    });
    var medBill = { 2024:{}, 2025:{}, 2026:{} };
    var medCir  = { 2024:{}, 2025:{}, 2026:{} };

    // 3a-bis. Acumuladores facturación mensual real (todos los tipos, para COM.ing_m)
    var monthBill = {};
    years.forEach(function(y) {
      monthBill[y] = {};
      for (var m = 1; m <= 12; m++) monthBill[y][m] = 0;
    });

    // 3a-ter. Acumuladores LIOs — Unidad de Negocio Lentes
    //  lioCir[y][m]   = nº de filas con tipo='LIOS' (= cirugías de lente = pacientes-evento)
    //  lioUni[y][m]   = suma columna R (Cantidad) en filas LIOS (= lentes implantados)
    //  lioCirMed[y]  = nº de filas LIOS por médico
    //  lioUniMed[y]  = suma Cantidad LIOS por médico
    var lioCir = {}, lioUni = {}, lioCirMed = {}, lioUniMed = {};
    years.forEach(function(y) {
      lioCir[y] = {}; lioUni[y] = {};
      lioCirMed[y] = {}; lioUniMed[y] = {};
      for (var m = 1; m <= 12; m++) { lioCir[y][m] = 0; lioUni[y][m] = 0; }
    });

    // 3b. Acumuladores MTD (mes actual en curso)
    var todayColombiaStr = Utilities.formatDate(now, CFG.timezone, 'yyyy-MM-dd');
    var todayY = parseInt(todayColombiaStr.substring(0,4), 10);
    var todayM = parseInt(todayColombiaStr.substring(5,7), 10);
    var todayD = parseInt(todayColombiaStr.substring(8,10), 10);
    var daysInMonth = new Date(todayY, todayM, 0).getDate(); // días totales del mes
    var mtd = {
      ing: 0, cir: 0,
      lio_cir: 0, lio_uni: 0,  // LIOs MTD: nº cirugías de lente y lentes implantados
      lineas: [0,0,0,0,0,0],
      medBill: {}, medCir: {}
    };

    // 3c. Acumuladores DAILY (últimos 45 días para cubrir "esta semana" y comparaciones)
    var cutoffDate = new Date(now.getTime() - 45 * 24 * 3600 * 1000);
    var dailyAgg = {}; // { 'YYYY-MM-DD': {f,y,m,w,d,ing,cir} }

    // 4. Iterar filas
    for (var i = 0; i < data.length; i++) {
      var row    = data[i];
      var anoRaw = row[COL.ANO];
      var mes    = row[COL.MES];
      var tipo   = (row[COL.TIPO]   || '').toString().trim().toUpperCase();
      var valor  = Number(row[COL.VALOR]) || 0;
      var medico = (row[COL.MEDICO] || '').toString().trim().toUpperCase();
      // Cantidad (columna R) — usa 1 si está vacía o no es número válido
      var cantidadRaw = row[COL.CANTIDAD];
      var cantidad = Number(cantidadRaw);
      if (!isFinite(cantidad) || cantidad <= 0) cantidad = 1;

      // Normalizar typo 3026 → 2026
      var ano = (anoRaw === 3026) ? 2026 : Number(anoRaw);
      if (years.indexOf(ano) < 0) continue;
      if (mes < 1 || mes > 12)    continue;

      // ── Facturación mensual total (TODOS los tipos — para COM.ing_m) ─
      monthBill[ano][mes] += valor;

      // ── COM por tipo ──────────────────────────────────────────────
      if (tipo && TIPO_IDX.hasOwnProperty(tipo)) {
        comSum[ano][TIPO_IDX[tipo]] += valor;
      }

      // ── Cirugías: DERECHOS SALA ───────────────────────────────────
      if (tipo === 'DERECHOS SALA') {
        cirCount[ano][mes]++;
        if (medico) medCir[ano][medico] = (medCir[ano][medico] || 0) + 1;
      }

      // ── LIOs: Unidad de Negocio Lentes ────────────────────────────
      // 1 fila con tipo=LIOS = 1 cirugía de lente (1 paciente-evento)
      // Cantidad (col R) = nº de lentes implantados en esa cirugía (1 ó 2)
      if (tipo === 'LIOS') {
        lioCir[ano][mes]++;
        lioUni[ano][mes] += cantidad;
        if (medico) {
          lioCirMed[ano][medico] = (lioCirMed[ano][medico] || 0) + 1;
          lioUniMed[ano][medico] = (lioUniMed[ano][medico] || 0) + cantidad;
        }
      }

      // ── Facturación total del médico ──────────────────────────────
      if (medico) medBill[ano][medico] = (medBill[ano][medico] || 0) + valor;

      // ── MTD: mes actual en curso (usa MES+ANO — no requiere columna fecha) ──
      if (ano === todayY && mes === todayM) {
        mtd.ing += valor;
        if (tipo === 'DERECHOS SALA') mtd.cir++;
        if (tipo === 'LIOS') { mtd.lio_cir++; mtd.lio_uni += cantidad; }
        if (TIPO_IDX.hasOwnProperty(tipo)) mtd.lineas[TIPO_IDX[tipo]] += valor;
        if (medico) {
          mtd.medBill[medico] = (mtd.medBill[medico] || 0) + valor;
          if (tipo === 'DERECHOS SALA') mtd.medCir[medico] = (mtd.medCir[medico] || 0) + 1;
        }
      }

      // ── DAILY: últimos 45 días (requiere columna fecha COL.FECHA) ──
      var fechaRaw = row[COL.FECHA];
      var fechaDate = null;
      if (fechaRaw instanceof Date && !isNaN(fechaRaw.getTime())) {
        fechaDate = fechaRaw;
      } else if (typeof fechaRaw === 'string' && fechaRaw.length >= 8) {
        var parsed = new Date(fechaRaw);
        if (!isNaN(parsed.getTime())) fechaDate = parsed;
      } else if (typeof fechaRaw === 'number' && fechaRaw > 40000) {
        // Google Sheets serial date (days since Dec 30, 1899)
        fechaDate = new Date((fechaRaw - 25569) * 86400 * 1000);
      }

      if (fechaDate && fechaDate >= cutoffDate) {
        var fStr = Utilities.formatDate(fechaDate, CFG.timezone, 'yyyy-MM-dd');
        var fY = parseInt(fStr.substring(0,4), 10);
        var fM = parseInt(fStr.substring(5,7), 10);
        var fD = parseInt(fStr.substring(8,10), 10);
        if (!dailyAgg[fStr]) {
          dailyAgg[fStr] = {
            f: fStr, y: fY, m: fM,
            w: _isoWeek(fechaDate),
            d: fD, ing: 0, cir: 0
          };
        }
        dailyAgg[fStr].ing += valor;
        if (tipo === 'DERECHOS SALA') dailyAgg[fStr].cir++;
      }
    }
    llog('✅ Agregación lista: ' + (Date.now()-t0) + 'ms');

    // 5. Convertir y armar arrays COM/CIR (igual que v4)
    function toMiles(arr) { return arr.map(function(v){ return Math.round(v/1000); }); }
    function mesArr(year) {
      var a = [];
      for (var m = 1; m <= 12; m++) a.push(cirCount[year][m] || 0);
      return a;
    }
    function ingMesArr(year) {
      var a = [];
      for (var m = 1; m <= 12; m++) a.push(Math.round((monthBill[year][m]||0)/1000));
      return a;
    }

    var v24 = toMiles(comSum[2024]);
    var v25 = toMiles(comSum[2025]);
    var v26 = toMiles(comSum[2026]);
    var m24 = mesArr(2024);
    var m25 = mesArr(2025);
    var m26 = mesArr(2026);
    var ib24 = ingMesArr(2024);
    var ib25 = ingMesArr(2025);
    var ib26 = ingMesArr(2026);
    llog('📈 Facturación mensual real — 2026: ['+ib26.slice(0,6).join(',')+',...]');
    var cir24 = m24.reduce(function(a,b){return a+b;},0);
    var cir25 = m25.reduce(function(a,b){return a+b;},0);
    var cir26 = m26.reduce(function(a,b){return a+b;},0);
    var cirPct = cir24>0 ? Math.round((cir25/cir24-1)*1000)/10 : 0;

    // ── LIOs mensuales: cirugías de lente y lentes implantados ──────
    function lioArr(year, dict) {
      var a = [];
      for (var m = 1; m <= 12; m++) a.push(dict[year][m] || 0);
      return a;
    }
    var lcir24 = lioArr(2024, lioCir), lcir25 = lioArr(2025, lioCir), lcir26 = lioArr(2026, lioCir);
    var luni24 = lioArr(2024, lioUni), luni25 = lioArr(2025, lioUni), luni26 = lioArr(2026, lioUni);
    var lcir26Tot = lcir26.reduce(function(a,b){return a+b;},0);
    var luni26Tot = luni26.reduce(function(a,b){return a+b;},0);
    llog('💎 LIOs 2026 — cirugías: '+lcir26Tot+' · lentes implantados: '+luni26Tot+' · ratio: '+(lcir26Tot>0?(luni26Tot/lcir26Tot).toFixed(2):'-'));

    var lastMes26 = 0;
    for (var mm = 12; mm >= 1; mm--) { if (m26[mm-1]>0) { lastMes26=mm; break; } }
    var ytdLabel = lastMes26>0 ? MES_NAMES[lastMes26]+' 2026 (YTD)' : '2026 YTD';

    llog('📊 COM v26: ['+v26+'] → '+ytdLabel);
    llog('🏥 Cirugías 2024/25/26: '+cir24+' / '+cir25+' / '+cir26);
    llog('📅 MTD '+MES_NAMES[todayM]+'-'+todayY+': ing='+Math.round(mtd.ing/1000)+'K · cir='+mtd.cir+' · día '+todayD+'/'+daysInMonth);

    // 6. Construir bloque MTD_RAW
    var mtdLineas = mtd.lineas.map(function(v){return Math.round(v/1000);});
    // Top cirujanos MTD (los que tienen facturación > 0, ordenados por facturación desc)
    var mtdCirujanos = [];
    var cirujanoNames = [
      'DR. MIGUEL ANTONIO JARAMILLO NOGUERA',
      'DR. JON KEPA BALPARDA',
      'DR. MIGUEL JARAMILLO MARTINEZ',
      'DR. JORGE EMILIO JARAMILLO NOGUERA',
      'DR. JORGE ALEJANDRO JARAMILLO HENRIQUEZ',
      'DR. JUAN GONZALO SANCHEZ MONTOYA',
      'DR. BORIS ARTURO RAMIREZ SERAFINOFF',
      'DR. JOSE AGUSTIN JARAMILLO SOLA',
      'DR. JUAN CARLOS GIL MUÑOZ',
      'DRA. CAROLINA SARDI CORREA'
    ];
    var cirujanoDisplay = [
      'Dr. M.A. Jaramillo N.','Dr. Jon K. Balparda','Dr. M. Jaramillo M.',
      'Dr. J.E. Jaramillo N.','Dr. J.A. Jaramillo H.','Dr. J.G. Sánchez M.',
      'Dr. B.A. Ramírez S.','Dr. J.A. Jaramillo S.','Dr. J.C. Gil Muñoz',
      'Dra. C. Sardi Correa'
    ];
    for (var ci = 0; ci < cirujanoNames.length; ci++) {
      var sn = cirujanoNames[ci];
      var bill = Math.round((mtd.medBill[sn]||0)/1000);
      var cir  = mtd.medCir[sn] || 0;
      if (bill > 0 || cir > 0) {
        mtdCirujanos.push('{name:\''+cirujanoDisplay[ci]+'\',bill:'+bill+',cir:'+cir+'}');
      }
    }
    var mtdJson = '{y:'+todayY+',m:'+todayM+',d:'+todayD+
      ',ing:'+Math.round(mtd.ing/1000)+
      ',cir:'+mtd.cir+
      ',lio_cir:'+mtd.lio_cir+
      ',lio_uni:'+mtd.lio_uni+
      ',daysInMonth:'+daysInMonth+
      ',lineas:['+mtdLineas.join(',')+']'+
      ',cirujanos:['+mtdCirujanos.join(',')+']}';

    // 7. Construir bloque DAILY_RAW (últimos 45 días, ordenados por fecha)
    var dailyKeys = Object.keys(dailyAgg).sort();
    var dailyEntries = dailyKeys.map(function(k) {
      var r = dailyAgg[k];
      return '{f:\''+r.f+'\',y:'+r.y+',m:'+r.m+',w:'+r.w+',d:'+r.d+',ing:'+Math.round(r.ing/1000)+',cir:'+r.cir+'}';
    });
    var dailyJson = dailyEntries.length > 0
      ? '[\n  ' + dailyEntries.join(',\n  ') + '\n]'
      : '[]';
    llog('📆 DAILY_RAW: '+dailyKeys.length+' días con datos (últimos 45d)');

    // 8. Obtener index.html de GitHub
    var fileUrl = CFG.ghApi+'/repos/'+CFG.ghOwner+'/'+CFG.ghRepo+'/contents/'+CFG.ghFile;
    var headers = {
      'Authorization': 'token '+ghPat,
      'Accept':        'application/vnd.github.v3+json',
      'User-Agent':    'OET-AutoSync/5.0'
    };
    var getResp = UrlFetchApp.fetch(fileUrl, {headers:headers, muteHttpExceptions:true});
    if (getResp.getResponseCode() !== 200) {
      throw new Error('GitHub GET ' + getResp.getResponseCode() + ': ' +
                      getResp.getContentText().substring(0,200));
    }
    var fileData = JSON.parse(getResp.getContentText());
    var sha  = fileData.sha;
    var html = Utilities.newBlob(Utilities.base64Decode(
                 fileData.content.replace(/\n/g,''))).getDataAsString('UTF-8');

    // 9. Reemplazar bloque OET_DATA (COM/CIR — igual que v4)
    var START = '/* ==OET_DATA_START== */';
    var END   = '/* ==OET_DATA_END== */';
    var si = html.indexOf(START);
    var ei = html.indexOf(END);
    if (si<0 || ei<0) throw new Error('Marcadores OET_DATA_START/END no encontrados en el HTML.');
    ei += END.length;
    var block = html.substring(si, ei);

    block = block.replace(
      /v24:\s*\[[^\]]*\],\s*\/\* AUTO \*\//,
      'v24: ['+v24.join(',')+'], /* AUTO */'
    );
    block = block.replace(
      /v25:\s*\[[^\]]*\],\s*\/\* AUTO \*\//,
      'v25: ['+v25.join(',')+'], /* AUTO */'
    );
    block = block.replace(
      /v26:\s*\[[^\]]*\],\s*\/\/[^/]*\/\* AUTO \*\//,
      'v26: ['+v26.join(',')+'],   // '+ytdLabel+' /* AUTO */'
    );
    block = block.replace(
      /cirugias:\s*\{[^}]*\},\s*\/\* AUTO \*\//,
      'cirugias: {v24:'+cir24+', v25:'+cir25+', v26:'+cir26+', pct:'+cirPct+'}, /* AUTO */'
    );
    block = block.replace(
      /mes_24:\s*\[[^\]]*\],\s*\/\/[^/]*\/\* AUTO \*\//,
      'mes_24:['+m24.join(',')+'],  // total='+cir24+' /* AUTO */'
    );
    block = block.replace(
      /mes_25:\s*\[[^\]]*\],\s*\/\/[^/]*\/\* AUTO \*\//,
      'mes_25:['+m25.join(',')+'],  // total='+cir25+' /* AUTO */'
    );
    block = block.replace(
      /mes_26:\s*\[[^\]]*\],\s*\/\/[^/]*\/\* AUTO \*\//,
      'mes_26:['+m26.join(',')+'],  // total='+cir26+' ('+ts+') /* AUTO */'
    );
    // Actualizar ing_m24/25/26 (facturación mensual real para gráficos comerciales)
    block = block.replace(
      /ing_m24:\s*\[[^\]]*\],\s*\/\* AUTO-ING \*\//,
      'ing_m24: ['+ib24.join(',')+'],  /* AUTO-ING */'
    );
    block = block.replace(
      /ing_m25:\s*\[[^\]]*\],\s*\/\* AUTO-ING \*\//,
      'ing_m25: ['+ib25.join(',')+'],  /* AUTO-ING */'
    );
    block = block.replace(
      /ing_m26:\s*\[[^\]]*\],\s*\/\* AUTO-ING \*\//,
      'ing_m26: ['+ib26.join(',')+'],  /* AUTO-ING */'
    );

    // ── LIOs mensuales — Unidad de Negocio Lentes ───────────────────
    //  lio_cir_mYY = nº de cirugías de lente por mes
    //  lio_uni_mYY = nº de lentes implantados por mes (suma de Cantidad)
    block = block.replace(
      /lio_cir_m24:\s*\[[^\]]*\],\s*\/\* AUTO-LIO \*\//,
      'lio_cir_m24: ['+lcir24.join(',')+'],  /* AUTO-LIO */'
    );
    block = block.replace(
      /lio_cir_m25:\s*\[[^\]]*\],\s*\/\* AUTO-LIO \*\//,
      'lio_cir_m25: ['+lcir25.join(',')+'],  /* AUTO-LIO */'
    );
    block = block.replace(
      /lio_cir_m26:\s*\[[^\]]*\],\s*\/\* AUTO-LIO \*\//,
      'lio_cir_m26: ['+lcir26.join(',')+'],  /* AUTO-LIO */'
    );
    block = block.replace(
      /lio_uni_m24:\s*\[[^\]]*\],\s*\/\* AUTO-LIO \*\//,
      'lio_uni_m24: ['+luni24.join(',')+'],  /* AUTO-LIO */'
    );
    block = block.replace(
      /lio_uni_m25:\s*\[[^\]]*\],\s*\/\* AUTO-LIO \*\//,
      'lio_uni_m25: ['+luni25.join(',')+'],  /* AUTO-LIO */'
    );
    block = block.replace(
      /lio_uni_m26:\s*\[[^\]]*\],\s*\/\* AUTO-LIO \*\//,
      'lio_uni_m26: ['+luni26.join(',')+'],  /* AUTO-LIO */'
    );

    block = block.replace(
      /\{name:'([^']+)',\s*sheetName:'([^']+)',\s*bill24:\d+,\s*bill25:\d+,\s*bill26:\d+,\s*cir24:\d+,\s*cir25:\d+,\s*cir26:\d+,\s*lio_cir24:\d+,\s*lio_cir25:\d+,\s*lio_cir26:\d+,\s*lio_uni24:\d+,\s*lio_uni25:\d+,\s*lio_uni26:\d+,\s*esp:'([^']*)'\},\s*\/\* AUTO \*\//g,
      function(match, displayName, sheetName, esp) {
        var b24 = Math.round((medBill[2024][sheetName]||0)/1000);
        var b25 = Math.round((medBill[2025][sheetName]||0)/1000);
        var b26 = Math.round((medBill[2026][sheetName]||0)/1000);
        var c24 = medCir[2024][sheetName] || 0;
        var c25 = medCir[2025][sheetName] || 0;
        var c26 = medCir[2026][sheetName] || 0;
        var lc24 = lioCirMed[2024][sheetName] || 0;
        var lc25 = lioCirMed[2025][sheetName] || 0;
        var lc26 = lioCirMed[2026][sheetName] || 0;
        var lu24 = lioUniMed[2024][sheetName] || 0;
        var lu25 = lioUniMed[2025][sheetName] || 0;
        var lu26 = lioUniMed[2026][sheetName] || 0;
        llog('  👨‍⚕️ '+displayName+' → bill='+b24+'/'+b25+'/'+b26+' cir='+c24+'/'+c25+'/'+c26+' lio_cir='+lc24+'/'+lc25+'/'+lc26+' lio_uni='+lu24+'/'+lu25+'/'+lu26);
        return "{name:'"+displayName+"', sheetName:'"+sheetName+
               "', bill24:"+b24+", bill25:"+b25+", bill26:"+b26+
               ", cir24:"+c24+", cir25:"+c25+", cir26:"+c26+
               ", lio_cir24:"+lc24+", lio_cir25:"+lc25+", lio_cir26:"+lc26+
               ", lio_uni24:"+lu24+", lio_uni25:"+lu25+", lio_uni26:"+lu26+
               ", esp:'"+esp+"'}, /* AUTO */";
      }
    );

    var newHtml = html.substring(0, si) + block + html.substring(ei);

    // 10. Reemplazar bloque MTD_RAW
    var mtdStart = '// ==MTD_DATA_START==';
    var mtdEnd   = '// ==MTD_DATA_END==';
    var msi = newHtml.indexOf(mtdStart);
    var mei = newHtml.indexOf(mtdEnd);
    if (msi >= 0 && mei >= 0) {
      mei += mtdEnd.length;
      var mtdBlock = mtdStart + '\nconst MTD_RAW = ' + mtdJson + '; /* AUTO-MTD */\n' + mtdEnd;
      newHtml = newHtml.substring(0, msi) + mtdBlock + newHtml.substring(mei);
      llog('✅ MTD_RAW actualizado → ' + MES_NAMES[todayM]+'-'+todayY+' día '+todayD);
    } else {
      llog('⚠️  Marcadores MTD_DATA_START/END no encontrados — MTD no actualizado');
    }

    // 11. Reemplazar bloque DAILY_RAW
    var dailyStart = '// ==DAILY_DATA_START==';
    var dailyEnd   = '// ==DAILY_DATA_END==';
    var dsi = newHtml.indexOf(dailyStart);
    var dei = newHtml.indexOf(dailyEnd);
    if (dsi >= 0 && dei >= 0) {
      dei += dailyEnd.length;
      var dailyBlock = dailyStart + '\nconst DAILY_RAW = ' + dailyJson + '; /* AUTO-DAILY */\n' + dailyEnd;
      newHtml = newHtml.substring(0, dsi) + dailyBlock + newHtml.substring(dei);
      llog('✅ DAILY_RAW actualizado → ' + dailyKeys.length + ' días');
    } else {
      llog('⚠️  Marcadores DAILY_DATA_START/END no encontrados — DAILY no actualizado');
    }

    // 11b. Reemplazar bloque LAST_SYNC (timestamp del último sync exitoso)
    var syncTsStart = '// ==SYNC_TS_START==';
    var syncTsEnd   = '// ==SYNC_TS_END==';
    var stsi = newHtml.indexOf(syncTsStart);
    var stei = newHtml.indexOf(syncTsEnd);
    if (stsi >= 0 && stei >= 0) {
      stei += syncTsEnd.length;
      var syncBlock = syncTsStart + '\nconst LAST_SYNC = \'' + ts + '\'; /* AUTO-SYNC-TS */\n' + syncTsEnd;
      newHtml = newHtml.substring(0, stsi) + syncBlock + newHtml.substring(stei);
      llog('✅ LAST_SYNC actualizado → ' + ts);
    } else {
      llog('⚠️  Marcadores SYNC_TS_START/END no encontrados — LAST_SYNC no actualizado');
    }

    // 12. Push a GitHub
    llog('⬆️  Subiendo a GitHub…');
    var newContent = Utilities.base64Encode(Utilities.newBlob(newHtml).getBytes());
    var putResp = UrlFetchApp.fetch(fileUrl, {
      method: 'PUT',
      headers: headers,
      payload: JSON.stringify({
        message: 'auto-sync '+ts+' | MTD '+MES_NAMES[todayM]+'-'+todayY+' d'+todayD+
                 ' ing='+Math.round(mtd.ing/1000)+'K cir'+mtd.cir+
                 ' | cir26='+cir26,
        content: newContent,
        sha: sha,
        branch: CFG.ghBranch
      }),
      muteHttpExceptions: true
    });

    var code = putResp.getResponseCode();
    if (code !== 200 && code !== 201) {
      throw new Error('GitHub PUT '+code+': '+putResp.getContentText().substring(0,400));
    }

    var elapsed = Math.round((Date.now()-t0)/1000);
    llog('✅ Dashboard actualizado · '+ts+' · '+elapsed+'s');
    _writeLog(ss, ts, '✅ OK',
      'MTD='+Math.round(mtd.ing/1000)+'K cir'+mtd.cir+' | cir26='+cir26+' | daily='+dailyKeys.length+'d | '+elapsed+'s');

  } catch(e) {
    llog('❌ ERROR: ' + e.message);
    _writeLog(SpreadsheetApp.getActiveSpreadsheet(), ts, '❌ ERROR', e.message);
    try {
      MailApp.sendEmail({
        to:      CFG.alertEmail,
        subject: '🚨 OET Dashboard sync FALLÓ — '+ts,
        body:    'El sync automático del dashboard OET falló a las '+ts+
                 ' (hora Colombia).\n\nError:\n'+e.message+
                 '\n\nLog:\n'+log.join('\n')+
                 '\n\nAccede al Apps Script en:\nhttps://script.google.com'+
                 '\n\nVerifica el token GH_PAT con checkHealth().'
      });
      llog('📧 Alerta de fallo enviada a '+CFG.alertEmail);
    } catch(mailErr) {
      llog('⚠️  No se pudo enviar correo de alerta: '+mailErr.message);
    }
  }
}

// ── Número de semana ISO (lunes como primer día) ───────────────────────
function _isoWeek(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ── Registro de historial en pestaña SyncLog ───────────────────────────
function _writeLog(ss, ts, status, detail) {
  try {
    var logSheet = ss.getSheetByName(CFG.logSheet);
    if (!logSheet) {
      logSheet = ss.insertSheet(CFG.logSheet);
      logSheet.appendRow(['Timestamp', 'Estado', 'Detalle']);
      logSheet.getRange(1,1,1,3).setFontWeight('bold');
      logSheet.setFrozenRows(1);
    }
    logSheet.appendRow([ts, status, detail]);
    var rows = logSheet.getLastRow();
    if (rows > 201) logSheet.deleteRows(2, rows - 201);
  } catch(e) {
    Logger.log('⚠️  No se pudo escribir log: '+e.message);
  }
}

// ── Verificación de salud ──────────────────────────────────────────────
/**
 * Ejecuta esta función para verificar que todo esté configurado correctamente.
 * Selecciónala en el menú y haz clic ▶ Ejecutar.
 */
function checkHealth() {
  Logger.log('=== OET Dashboard — Diagnóstico de salud v5.0 ===');

  var props = PropertiesService.getScriptProperties();
  var ghPat = props.getProperty('GH_PAT');
  if (ghPat) {
    Logger.log('✅ GH_PAT configurado (' + ghPat.substring(0,8) + '...)');
  } else {
    Logger.log('❌ GH_PAT NO configurado. Ejecuta setGithubPAT().');
    return;
  }

  var fileUrl = CFG.ghApi+'/repos/'+CFG.ghOwner+'/'+CFG.ghRepo+'/contents/'+CFG.ghFile;
  var headers = {
    'Authorization': 'token '+ghPat,
    'Accept':        'application/vnd.github.v3+json',
    'User-Agent':    'OET-HealthCheck/5.0'
  };
  try {
    var resp = UrlFetchApp.fetch(fileUrl, {headers:headers, muteHttpExceptions:true});
    var code = resp.getResponseCode();
    if (code === 200) {
      Logger.log('✅ GitHub API OK — index.html accesible');
      // Verificar marcadores nuevos
      var fileData = JSON.parse(resp.getContentText());
      var html = Utilities.newBlob(Utilities.base64Decode(
                   fileData.content.replace(/\n/g,''))).getDataAsString('UTF-8');
      Logger.log(html.indexOf('==MTD_DATA_START==')>=0
        ? '✅ Marcador MTD_DATA_START encontrado'
        : '❌ Marcador MTD_DATA_START NO encontrado — ¿actualizaste el index.html?');
      Logger.log(html.indexOf('==DAILY_DATA_START==')>=0
        ? '✅ Marcador DAILY_DATA_START encontrado'
        : '❌ Marcador DAILY_DATA_START NO encontrado — ¿actualizaste el index.html?');
    } else if (code === 401) {
      Logger.log('❌ GitHub 401 — Token expirado. Regenera el PAT y ejecuta setGithubPAT().');
    } else {
      Logger.log('⚠️  GitHub respondió ' + code);
    }
  } catch(e) {
    Logger.log('❌ No se pudo conectar a GitHub: ' + e.message);
  }

  // Verificar columna FECHA (COL.FECHA)
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CFG.sheetName);
  if (sheet) {
    Logger.log('✅ Hoja "'+CFG.sheetName+'" existe — '+sheet.getLastRow()+' filas');
    // Muestra las primeras 3 filas de la columna FECHA para verificar
    var sampleData = sheet.getRange(2, COL.FECHA+1, 3, 1).getValues();
    Logger.log('🗓  Columna FECHA (A='+COL.FECHA+'): primeras 3 filas = '+
               sampleData.map(function(r){return JSON.stringify(r[0]);}).join(' | '));
    Logger.log('   Si no son fechas válidas, ajusta COL.FECHA en la configuración.');
  } else {
    Logger.log('❌ Hoja "'+CFG.sheetName+'" no encontrada.');
  }

  var triggers = ScriptApp.getProjectTriggers();
  var syncTriggers = triggers.filter(function(t){ return t.getHandlerFunction()==='syncDashboard'; });
  Logger.log('⏰ Triggers activos para syncDashboard: ' + syncTriggers.length);
  if (syncTriggers.length === 0) Logger.log('❌ No hay triggers. Ejecuta setupTriggers().');

  var logSheet = ss.getSheetByName(CFG.logSheet);
  if (logSheet && logSheet.getLastRow() > 1) {
    var lastLog = logSheet.getRange(logSheet.getLastRow(), 1, 1, 3).getValues()[0];
    Logger.log('📋 Último sync: '+lastLog[0]+' — '+lastLog[1]+' — '+lastLog[2]);
  }

  Logger.log('=== Diagnóstico completo ===');
}

// ── Configuración inicial ──────────────────────────────────────────────

/**
 * PASO 1: Guarda el token de GitHub.
 * Si el token expira, actualiza el valor 'ghp_...' y vuelve a ejecutar esta función.
 */
function setGithubPAT() {
  var pat = 'TU_TOKEN_AQUI';;  // ← reemplaza si el token expira
  PropertiesService.getScriptProperties().setProperty('GH_PAT', pat);
  Logger.log('✅ GH_PAT guardado: ' + pat.substring(0,8) + '...');
}

/**
 * PASO 2: Instala los triggers automáticos.
 * Ejecuta esta función UNA SOLA VEZ.
 */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'syncDashboard') ScriptApp.deleteTrigger(t);
  });

  // Trigger 1: Todos los días a medianoche Colombia
  ScriptApp.newTrigger('syncDashboard')
    .timeBased().atHour(0).nearMinute(0).everyDays(1).create();

  // Trigger 2: Cada 30 minutos para mantener datos frescos
  ScriptApp.newTrigger('syncDashboard')
    .timeBased().everyMinutes(30).create();

  Logger.log('⏰ Triggers instalados:');
  Logger.log('   → Medianoche diario (00:00 Colombia)');
  Logger.log('   → Cada 30 minutos');
  Logger.log('⚠️  Verifica que el timezone sea "America/Bogota" en Configuración (⚙️).');
}

function installTrigger() { setupTriggers(); }

function removeAllTriggers() {
  var count = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'syncDashboard') { ScriptApp.deleteTrigger(t); count++; }
  });
  Logger.log('⏹  ' + count + ' trigger(s) eliminado(s).');
}

/**
 * Fuerza una sincronización manual inmediata.
 * Útil para probar que MTD y DAILY funcionan correctamente.
 */
function syncNow() {
  Logger.log('🔄 Sync manual iniciado (v5.0 — incluye MTD y DAILY)…');
  syncDashboard();
}

// ═══════════════════════════════════════════════════════════════════════
//  WEB APP — Endpoint para botón "Actualizar Ahora" del dashboard
// ═══════════════════════════════════════════════════════════════════════
//  PASO PARA ACTIVAR (una sola vez):
//    1. Ejecuta setRefreshToken() en este editor.
//       Logger imprimirá un token UUID. Cópialo.
//    2. Despliega como Web App:
//       Deploy ▸ New deployment ▸ Type: Web App
//       - Execute as:    Me (tu cuenta)
//       - Who has access: Anyone
//       Click Deploy → copia la URL "Web app URL" (termina en /exec).
//    3. Pega la URL y el token en index.html (constantes
//       SYNC_WEBHOOK_URL y SYNC_WEBHOOK_TOKEN).
//    4. Commit + push del index.html.
//
//  Cada vez que actualices el script: Deploy ▸ Manage deployments ▸
//  el "↻ icono" para crear nueva versión (mantiene la misma URL).
// ═══════════════════════════════════════════════════════════════════════

function doGet(e)  { return _handleManualSync(e); }
function doPost(e) { return _handleManualSync(e); }

function _handleManualSync(e) {
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  var SECRET = PropertiesService.getScriptProperties().getProperty('REFRESH_TOKEN');
  var provided = (e && e.parameter && e.parameter.token) ? e.parameter.token : '';

  if (!SECRET) {
    output.setContent(JSON.stringify({
      ok: false,
      error: 'REFRESH_TOKEN no configurado en Apps Script. Ejecuta setRefreshToken() primero.'
    }));
    return output;
  }
  if (provided !== SECRET) {
    output.setContent(JSON.stringify({ok: false, error: 'unauthorized'}));
    return output;
  }

  try {
    var t0 = Date.now();
    syncDashboard();
    var elapsed = Math.round((Date.now() - t0) / 1000);
    var nowTs = Utilities.formatDate(new Date(), CFG.timezone, 'yyyy-MM-dd HH:mm:ss');
    output.setContent(JSON.stringify({
      ok: true,
      ts: nowTs,
      elapsed_s: elapsed,
      message: 'Sync ejecutado correctamente'
    }));
  } catch (err) {
    output.setContent(JSON.stringify({ok: false, error: err.message}));
  }
  return output;
}

/**
 * Genera y guarda un token aleatorio para el endpoint manual.
 * Ejecuta UNA SOLA VEZ. El token aparece en el Logger — cópialo a index.html.
 */
function setRefreshToken() {
  var token = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('REFRESH_TOKEN', token);
  Logger.log('🔑 REFRESH_TOKEN guardado.');
  Logger.log('   Token: ' + token);
  Logger.log('   Pega este valor en index.html → const SYNC_WEBHOOK_TOKEN = "...";');
}

/**
 * Diagnóstico del Web App. Ejecuta para verificar configuración.
 */
function checkWebApp() {
  var token = PropertiesService.getScriptProperties().getProperty('REFRESH_TOKEN');
  Logger.log('=== Web App — Diagnóstico ===');
  Logger.log(token ? '✅ REFRESH_TOKEN configurado: ' + token.substring(0,8) + '...'
                   : '❌ REFRESH_TOKEN NO configurado. Ejecuta setRefreshToken().');
  Logger.log('');
  Logger.log('Para obtener la URL del Web App:');
  Logger.log('  Deploy ▸ Manage deployments ▸ copia "Web app URL"');
  Logger.log('  Termina en /exec. Pégala en index.html → SYNC_WEBHOOK_URL.');
}
