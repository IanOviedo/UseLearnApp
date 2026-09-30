# .smoke-fase-cd.ps1 — Fases C2 + D: rutas del plan, transiciones de fase,
# material (explicaciones/ejercicios) y intentos. Cubre:
#   plan → enseñar → practicar → cerrar, más el guard de fase y la caché del bloque.
# Requiere un dev server con USELEARN_DB apuntando a una base temporal (ver ESTADO.md)
# y Ollama corriendo.
#
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File .smoke-fase-cd.ps1
# (el server debe estar corriendo con USELEARN_DB = el mismo $DbPath de abajo)
param(
  [string]$BaseUrl = "http://localhost:3111",
  [string]$Modelo = "gemma4:e2b",
  [string]$DbPath = "$env:TEMP\uselearn-smoke-cd.db"
)

# El helper escribe directo en la base (simula el sondeo): tiene que usar la MISMA
# base que el server, así que se exporta al entorno de este proceso.
$env:USELEARN_DB = $DbPath

$errores = @()

function Ok([string]$nombre, [bool]$cond, [string]$detalle = "") {
  # El detalle se imprime siempre (no solo al fallar): en un humo con datos generados
  # por el modelo, ver qué devolvió cada paso es la mitad del diagnóstico.
  $sufijo = if ($detalle) { "  ($detalle)" } else { "" }
  if ($cond) { Write-Host "  PASS  $nombre$sufijo" }
  else { Write-Host "  FAIL  $nombre$sufijo"; $script:errores += $nombre }
}

function Llamar([string]$metodo, [string]$ruta, [object]$body) {
  try {
    $r = Invoke-WebRequest -Uri "$BaseUrl$ruta" -Method $metodo -ContentType "application/json" `
      -Body ($body | ConvertTo-Json -Depth 8) -UseBasicParsing -TimeoutSec 300
    return @{ status = [int]$r.StatusCode; data = ($r.Content | ConvertFrom-Json) }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $status = [int]$resp.StatusCode
      $txt = ""
      try {
        $stream = $resp.GetResponseStream()
        if ($stream) { $stream.Position = 0; $txt = (New-Object System.IO.StreamReader($stream)).ReadToEnd() }
      } catch { }
      $data = $null
      try { $data = $txt | ConvertFrom-Json } catch { }
      return @{ status = $status; data = $data }
    }
    return @{ status = 0; data = $null }
  }
}

# Espera al server (Turbopack compila bajo demanda).
$listo = $false
for ($i = 0; $i -lt 60; $i++) {
  try { Invoke-WebRequest "$BaseUrl/api/modelos/listar" -UseBasicParsing -TimeoutSec 2 | Out-Null; $listo = $true; break }
  catch { Start-Sleep -Seconds 2 }
}
if (-not $listo) { Write-Host "FAIL: el server en $BaseUrl no respondió en 120s" -ForegroundColor Red; exit 1 }

$texto = @"
Arrays y objetos son las dos estructuras de datos básicas de JavaScript.
Un array guarda una lista ordenada y se accede por índice, empezando en 0.
Un objeto guarda pares clave-valor y se accede por el nombre de la clave.
push agrega un elemento al final del array; length devuelve cuántos elementos tiene.
Object.keys devuelve un array con las claves de un objeto.
"@

Write-Host "`n--- 1. Crear sesión (modo apunte) ---"
$r = Llamar Post "/api/sesiones/crear" @{ texto = $texto; modo = "apunte"; modeloPrincipal = $Modelo }
Ok "crear responde 200" ($r.status -eq 200 -and $r.data.sesionId) "status=$($r.status) sesionId=$($r.data.sesionId) subtemas=$(@($r.data.subtemas).Count)"
$sesionId = $r.data.sesionId
$subtemas = @($r.data.subtemas)
Ok "tiene 2+ sub-temas" ($subtemas.Count -ge 2) "count=$($subtemas.Count)"
if (-not $sesionId -or $subtemas.Count -lt 2) { Write-Host "No se puede seguir sin sesión válida"; exit 1 }

Write-Host "`n--- 2. Guard de fase (material antes del plan → 409) ---"
$r = Llamar Post "/api/aprender/bloque" @{ sesionId = $sesionId; subtemaId = $subtemas[0].id; modeloPrincipal = $Modelo }
Ok "bloque en fase sondeo → 409" ($r.status -eq 409) "status=$($r.status)"

Write-Host "`n--- 3. Simular el sondeo y leer rutas ---"
$estados = @()
$subtemas | ForEach-Object { $estados += @{ id = $_.id; intentos = 0; correctas = 0; incorrectas = 0; cubierto = $false } }
# subtema 1: débil (falló) → reforzar | subtema 2: dominado con práctica → practicar
# (si hay un 3º: nunca evaluado → sin_evaluar)
$estados[0].intentos = 4; $estados[0].correctas = 3; $estados[0].incorrectas = 1; $estados[0].cubierto = $true
$estados[1].intentos = 5; $estados[1].correctas = 5; $estados[1].incorrectas = 0; $estados[1].cubierto = $true
if ($estados.Count -ge 3) { $estados[2].intentos = 0 }
# JSON por archivo: PowerShell se come las comillas al pasar strings con comillas
# como argumento de un proceso nativo (node recibía JS sin comillas → SyntaxError).
$jsonRuta = Join-Path $env:TEMP "smoke-cd-estados.json"
$estados | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $jsonRuta
$helperOut = & node .smoke-fase-cd-db.mjs $sesionId $jsonRuta 2>&1 | Out-String
Ok "helper del sondeo corrió" ($LASTEXITCODE -eq 0) $helperOut

$r = Llamar Get "/api/sesiones/$sesionId" $null
Ok "GET responde 200" ($r.status -eq 200)
Ok "fase = plan" ($r.data.fase -eq "plan") "fase=$($r.data.fase)"
$ruta1 = ($r.data.rutas | Where-Object { $_.subtemaId -eq $subtemas[0].id }).ruta
$ruta2 = ($r.data.rutas | Where-Object { $_.subtemaId -eq $subtemas[1].id }).ruta
Ok "subtema 1 con errores → reforzar" ($ruta1 -eq "reforzar") "ruta=$ruta1"
Ok "subtema 2 dominado + práctica → practicar" ($ruta2 -eq "practicar") "ruta=$ruta2"
if ($estados.Count -ge 3) {
  $ruta3 = ($r.data.rutas | Where-Object { $_.subtemaId -eq $subtemas[2].id }).ruta
  Ok "subtema 3 sin evaluar → sin_evaluar" ($ruta3 -eq "sin_evaluar") "ruta=$ruta3"
}
Ok "aprendizaje arranca en 0" (-not ($r.data.aprendizaje | Where-Object { $_.ejercicios -ne 0 -or $_.explicaciones -ne 0 }))

Write-Host "`n--- 4. Transiciones de fase ---"
$r = Llamar Post "/api/sesiones/$sesionId/fase" @{ fase = "ensenar" }
Ok "plan → ensenar (200)" ($r.status -eq 200 -and $r.data.fase -eq "ensenar") "status=$($r.status)"
$r = Llamar Post "/api/sesiones/$sesionId/fase" @{ fase = "plan" }
Ok "retroceso ensenar → plan → 409" ($r.status -eq 409) "status=$($r.status)"
$r = Llamar Post "/api/sesiones/$sesionId/fase" @{ fase = "ensenar" }
Ok "reenable idempotente → 200" ($r.status -eq 200) "status=$($r.status)"
$r = Llamar Post "/api/sesiones/$sesionId/fase" @{ fase = "explorar" }
Ok "fase desconocida → 400" ($r.status -eq 400) "status=$($r.status)"

Write-Host "`n--- 5. Bloque de reforzar (explicaciones + ejercicios) ---"
$r = Llamar Post "/api/aprender/bloque" @{ sesionId = $sesionId; subtemaId = $subtemas[0].id; modeloPrincipal = $Modelo }
Ok "bloque reforzar → 200" ($r.status -eq 200) "status=$($r.status) ruta=$($r.data.ruta) explicaciones=$(@($r.data.explicaciones).Count) ejercicios=$(@($r.data.ejercicios).Count)"
$exp1 = @($r.data.explicaciones); $ej1 = @($r.data.ejercicios)
Ok "genera explicaciones (ruta reforzar)" ($exp1.Count -ge 1) "count=$($exp1.Count)"
Ok "genera ejercicios" ($ej1.Count -ge 1) "count=$($ej1.Count)"
Ok "las explicaciones traen titulo+contenido" (-not ($exp1 | Where-Object { -not $_.titulo -or -not $_.contenido }))
$codigos = @($ej1 | Where-Object { $_.tipo -eq "codigo" })
$tipos1 = (@($ej1 | ForEach-Object { $_.tipo }) -join "+")
$variantes1 = (@($codigos | ForEach-Object { $_.variante }) -join "+")
Ok "hay ejercicios de código con assertions" ($codigos.Count -ge 1 -and @($codigos[0].assertions).Count -ge 1) "tipos=$tipos1 codigos=$($codigos.Count) variantes=$variantes1"
if ($variantes1 -match "jsx") {
  Ok "la variante jsx sobrevive al dedup (mismo enunciado que js)" ($variantes1 -match "js" -and $codigos.Count -ge 2) "variantes=$variantes1"
}

Write-Host "`n--- 6. Caché del bloque (segunda llamada = mismos ids) ---"
$r2 = Llamar Post "/api/aprender/bloque" @{ sesionId = $sesionId; subtemaId = $subtemas[0].id; modeloPrincipal = $Modelo }
$ids1 = (@($ej1 | ForEach-Object { $_.id }) -join ",")
$ids2 = (@($r2.data.ejercicios | ForEach-Object { $_.id }) -join ",")
Ok "ejercicios cacheados (mismos ids)" ($r2.status -eq 200 -and $ids1 -eq $ids2 -and $ids1 -ne "") "1=$ids1 2=$ids2"
$expIds1 = (@($exp1 | ForEach-Object { $_.id }) -join ",")
$expIds2 = (@($r2.data.explicaciones | ForEach-Object { $_.id }) -join ",")
Ok "explicaciones cacheadas" ($expIds1 -eq $expIds2) "1=$expIds1 2=$expIds2"

Write-Host "`n--- 7. Bloque de practicar (solo ejercicios, 0 explicaciones) ---"
$r = Llamar Post "/api/aprender/bloque" @{ sesionId = $sesionId; subtemaId = $subtemas[1].id; modeloPrincipal = $Modelo }
Ok "bloque practicar → 200" ($r.status -eq 200) "status=$($r.status) ruta=$($r.data.ruta) explicaciones=$(@($r.data.explicaciones).Count) ejercicios=$(@($r.data.ejercicios).Count)"
Ok "ruta devuelta = practicar" ($r.data.ruta -eq "practicar") "ruta=$($r.data.ruta)"
Ok "sin explicaciones (0 lecturas)" (@($r.data.explicaciones).Count -eq 0) "count=$(@($r.data.explicaciones).Count)"
$ej2 = @($r.data.ejercicios)
Ok "genera ejercicios igual" ($ej2.Count -ge 1) "count=$($ej2.Count)"

Write-Host "`n--- 8. Intentos ---"
$quiz = @($ej1 + $ej2 | Where-Object { $_.tipo -eq "quiz" } | Select-Object -First 1)
Ok "existe al menos un quiz" ($quiz.Count -ge 1)
if ($quiz.Count -ge 1) {
  $q = $quiz[0]
  $mala = $q.opciones[0]
  if ($q.indiceCorrecta -eq 0) { $mala = $q.opciones[1] }
  $r = Llamar Post "/api/aprender/intento" @{ ejercicioId = $q.id; respuesta = $mala }
  Ok "respuesta incorrecta → aprobado=false" ($r.status -eq 200 -and $r.data.aprobado -eq $false) "data=$($r.data | ConvertTo-Json -Compress)"
  $bueno = $q.opciones[$q.indiceCorrecta]
  $r = Llamar Post "/api/aprender/intento" @{ ejercicioId = $q.id; respuesta = $bueno }
  Ok "respuesta correcta → aprobado=true" ($r.status -eq 200 -and $r.data.aprobado -eq $true) "data=$($r.data | ConvertTo-Json -Compress)"
}
if ($codigos.Count -ge 1) {
  $c = $codigos[0]
  $r = Llamar Post "/api/aprender/intento" @{ ejercicioId = $c.id; codigo = "function demo(){ return 1 }"; aprobado = $true; salida = '{"logs":[]}' }
  Ok "intento de código se registra" ($r.status -eq 200 -and $r.data.aprobado -eq $true) "data=$($r.data | ConvertTo-Json -Compress)"
}
$r = Llamar Post "/api/aprender/intento" @{ ejercicioId = 99999999 }
Ok "ejercicio inexistente → 404" ($r.status -eq 404) "status=$($r.status)"
# Cualquier tipo de ejercicio rechaza el payload vacío con 400 (quiz: falta respuesta,
# código: falta codigo), así que se usa el primero disponible sin depender de que exista
# un ejercicio de código.
$primero = @($ej1 + $ej2)[0]
if ($primero) {
  $r = Llamar Post "/api/aprender/intento" @{ ejercicioId = $primero.id; codigo = "" }
  Ok "payload vacío → 400" ($r.status -eq 400) "status=$($r.status)"
}

Write-Host "`n--- 9. Conteos después de aprobar ---"
$r = Llamar Get "/api/sesiones/$sesionId" $null
$conteo1 = $r.data.aprendizaje | Where-Object { $_.subtemaId -eq $subtemas[0].id }
Ok "subtema 1 tiene material contado" ($conteo1.explicaciones -ge 1 -and $conteo1.ejercicios -ge 1) "exp=$($conteo1.explicaciones) ej=$($conteo1.ejercicios)"
Ok "subtema 1 registra aprobados" ($conteo1.ejerciciosAprobados -ge 1) "aprobados=$($conteo1.ejerciciosAprobados)"

Write-Host "`n--- 10. Cierre y limpieza ---"
$r = Llamar Post "/api/sesiones/$sesionId/fase" @{ fase = "cerrar" }
Ok "ensenar → cerrar (200)" ($r.status -eq 200 -and $r.data.fase -eq "cerrar") "status=$($r.status)"
$r = Llamar Get "/api/sesiones/$sesionId" $null
Ok "GET refleja fase cerrar" ($r.data.fase -eq "cerrar") "fase=$($r.data.fase)"
$r = Llamar Post "/api/sesiones/eliminar" @{ sesionId = $sesionId }
Ok "sesión eliminada (incluye tablas nuevas)" ($r.status -eq 200) "status=$($r.status)"

Write-Host ""
if ($errores.Count -eq 0) {
  Write-Host "SMOKE FASE C/D: TODO OK ($([datetime]::Now.ToString('HH:mm:ss')))"
  exit 0
} else {
  Write-Host "SMOKE FASE C/D: $($errores.Count) fallos → $($errores -join ' | ')" -ForegroundColor Red
  exit 1
}
