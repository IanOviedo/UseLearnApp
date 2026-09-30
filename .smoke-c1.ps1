# .smoke-c1.ps1 — Fase C1: modalidades de entrada + confirmación de sub-temas.
# Requiere un dev server corriendo (ver abajo). Usa modelo chico para ser rápido:
# el flujo es idéntico al del default, solo cambia la calidad del texto.
#
# Uso:
#   $env:USELEARN_DB="$env:TEMP\uselearn-smoke-c1.db"
#   node node_modules\next\dist\bin\next dev -p 3111
#   powershell -File .smoke-c1.ps1
param(
  [string]$BaseUrl = "http://localhost:3111",
  [string]$Modelo = "gemma4:e2b"
)

$errores = @()

function Ok([string]$nombre, [bool]$cond, [string]$detalle = "") {
  # El detalle se imprime siempre (no solo al fallar): con datos generados por el modelo,
  # ver qué devolvió cada paso es la mitad del diagnóstico.
  $sufijo = ""
  if ($detalle) { $sufijo = "  ($detalle)" }
  if ($cond) {
    Write-Host "  PASS  $nombre$sufijo"
  } else {
    Write-Host "  FAIL  $nombre$sufijo" -ForegroundColor Red
    $script:errores += $nombre
  }
}

# --- Similitud (mismo criterio que lib/texto.ts) ------------------------------
# Se usa para verificar que los sub-temas no se repitan: la app compara por tokens
# significativos (Jaccard) porque "useState" y "useState básico" son lo mismo.
$PALABRAS_VACIAS = @('de','del','la','el','los','las','un','una','unos','unas','y','o','en','con','sin','para','por','que','al','a','su','sus','es','son','como','vs','sobre','entre','lo','se','mas','más','muy')

function TokensSignificativos([string]$texto) {
  $sinAcentos = $texto.Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}', ''
  $limpio = ($sinAcentos.ToLower() -replace '[^a-z0-9\s]', ' ')
  return @($limpio -split '\s+' | Where-Object { $_.Length -gt 1 -and $PALABRAS_VACIAS -notcontains $_ })
}

function Similitud([string]$a, [string]$b) {
  $ta = @(TokensSignificativos $a | Select-Object -Unique)
  $tb = @(TokensSignificativos $b | Select-Object -Unique)
  if ($ta.Count -eq 0 -or $tb.Count -eq 0) { return 0 }
  $comunes = @($ta | Where-Object { $tb -contains $_ }).Count
  return [double]$comunes / ($ta.Count + $tb.Count - $comunes)
}

function ParMasParecido([array]$items) {
  $peor = 0.0
  $par = ""
  for ($i = 0; $i -lt $items.Count; $i++) {
    for ($j = $i + 1; $j -lt $items.Count; $j++) {
      $s = Similitud ([string]$items[$i]) ([string]$items[$j])
      if ($s -gt $peor) { $peor = $s; $par = "$($items[$i]) ~ $($items[$j])" }
    }
  }
  return @{ similitud = [Math]::Round($peor, 2); par = $par }
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
        if ($stream) {
          $stream.Position = 0
          $txt = (New-Object System.IO.StreamReader($stream)).ReadToEnd()
        }
      } catch { }
      $data = $null
      try { $data = $txt | ConvertFrom-Json } catch { }
      return @{ status = $status; data = $data }
    }
    return @{ status = 0; data = $null }
  }
}

# Espera a que el server levante (Turbopack compila bajo demanda).
$listo = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    Invoke-WebRequest "$BaseUrl/api/modelos/listar" -UseBasicParsing -TimeoutSec 2 | Out-Null
    $listo = $true
    break
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $listo) {
  Write-Host "FAIL: el server en $BaseUrl no respondió en 120s" -ForegroundColor Red
  exit 1
}

$sesionesBorrar = @()

Write-Host "`n--- 1. Modalidad apunte (compat: funciona igual que siempre) ---"
$texto = @"
Los hooks de React son funciones que permiten usar estado y otros recursos en componentes funcionales.
useState devuelve un par: el valor actual del estado y una función para actualizarlo.
useEffect ejecuta efectos después del renderizado y acepta un array de dependencias.
Si el array de dependencias cambia, el efecto vuelve a correr; si está vacío, corre una sola vez.
"@
$r = Llamar Post "/api/sesiones/crear" @{ texto = $texto; modo = "apunte"; modeloPrincipal = $Modelo }
Ok "crear apunte responde 200" ($r.status -eq 200) "status=$($r.status) sesionId=$($r.data.sesionId) subtemas=$(@($r.data.subtemas).Count) bloques=$($r.data.analisis.bloques)"
$sesionA = $r.data.sesionId
$sesionesBorrar += $sesionA
Ok "apunte crea sub-temas" ($r.data.subtemas.Count -gt 0)
Ok "apunte responde modo=apunte" ($r.data.modo -eq "apunte")
Ok "apunte NO devuelve apunte generado" (-not $r.data.apunte)
# 374 caracteres no sostienen 10 sub-temas: pedirlos obligaba al modelo a inventar
# variantes del mismo concepto ("Hooks usan estado" / "Funciones permiten estado").
Ok "texto corto: no infla sub-temas con sinónimos (<=3)" (@($r.data.subtemas).Count -le 3) "count=$(@($r.data.subtemas).Count)"

Write-Host "`n--- 2. Validaciones ---"
$r = Llamar Post "/api/sesiones/crear" @{ texto = "  "; modo = "apunte"; modeloPrincipal = $Modelo }
Ok "apunte sin texto → 400" ($r.status -eq 400) "status=$($r.status)"
$r = Llamar Post "/api/sesiones/crear" @{ modo = "tema_libre"; modeloPrincipal = $Modelo }
Ok "tema_libre sin tema → 400" ($r.status -eq 400) "status=$($r.status)"

Write-Host "`n--- 3. Modalidad tema libre (genera apunte con el modelo) ---"
$r = Llamar Post "/api/sesiones/crear" @{
  modo = "tema_libre"
  tema = "estructuras de datos básicas en JavaScript: arrays y objetos"
  nivel = "basico"
  objetivo = "entender cuándo usar cada una"
  modeloPrincipal = $Modelo
}
Ok "crear tema_libre responde 200" ($r.status -eq 200) "status=$($r.status) sesionId=$($r.data.sesionId) subtemas=$(@($r.data.subtemas).Count)"
$sesionT = $r.data.sesionId
$sesionesBorrar += $sesionT
$apunte = [string]$r.data.apunte
Ok "devuelve un apunte no vacío" ($apunte.Length -gt 500) "largo=$($apunte.Length)"
Ok "devuelve sub-temas" ($r.data.subtemas.Count -gt 0)
Ok "topic es un título legible" ([string]$r.data.topic -and $r.data.topic.Length -lt 120) "topic=$($r.data.topic)"
# El apunte del modelo ronda los 3-4k caracteres: pedir los 10 del preset hace que el
# modelo repita el mismo concepto con sinónimos. Los sub-temas van en proporción al texto.
Ok "apunte de ~3,4k: sub-temas proporcionales (<=6)" (@($r.data.subtemas).Count -le 6) "count=$(@($r.data.subtemas).Count) chars=$($apunte.Length)"

$r2 = Llamar Get "/api/sesiones/$sesionT" $null
Ok "GET sesión trae modo=tema_libre" ($r2.data.modo -eq "tema_libre")
Ok "GET sesión trae el objetivo" ($r2.data.objetivo -eq "entender cuándo usar cada una")

Write-Host "`n--- 4. Confirmación de sub-temas (ingesta explícita) ---"
$subtemas = @($r2.data.subtemas)
Ok "la sesión tiene 2+ sub-temas para poder descartar" ($subtemas.Count -ge 2) "count=$($subtemas.Count)"
$mantener = @($subtemas[0].id)
if ($subtemas.Count -ge 3) { $mantener += $subtemas[2].id }
$r = Llamar Post "/api/sesiones/$sesionT/subtemas" @{ mantener = $mantener }
Ok "descarte responde 200" ($r.status -eq 200) "status=$($r.status) data=$($r.data | ConvertTo-Json -Compress)"
Ok "descarte reporta el conteo restante" ($r.data.restantes -eq $mantener.Count) "restantes=$($r.data.restantes) esperado=$($mantener.Count)"

$r = Llamar Post "/api/sesiones/$sesionT/subtemas" @{ mantener = @() }
Ok "mantener vacío → 400" ($r.status -eq 400) "status=$($r.status)"

$r = Llamar Post "/api/sesiones/99999999/subtemas" @{ mantener = @(1) }
Ok "sesión inexistente → 400" ($r.status -eq 400) "status=$($r.status)"

$r2 = Llamar Get "/api/sesiones/$sesionT" $null
Ok "GET refleja los sub-temas descartados" (@($r2.data.subtemas).Count -eq $mantener.Count) "count=$(@($r2.data.subtemas).Count)"
Ok "el progreso total baja en consecuencia" ($r2.data.progreso.subtemasTotal -eq $mantener.Count)

Write-Host "`n--- 5. Cobertura con texto largo (presets) ---"
# Antes el modelo solo veía el head del texto (~4k): con material largo salían 4-5
# sub-temas, todos del principio y del mismo tema. Ahora el texto se parte en bloques y la
# última parte del documento cuenta igual, así que este material tiene que rendir bastantes
# sub-temas distintos.
$textoLargo = (Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot ".smoke-texto-largo.txt")).Trim()
Ok "el material de prueba es largo de verdad" ($textoLargo.Length -gt 9000) "chars=$($textoLargo.Length)"

$r = Llamar Post "/api/sesiones/crear" @{ texto = $textoLargo; modo = "apunte"; modeloPrincipal = $Modelo; preset = "equilibrado" }
if ($r.data.sesionId) { $sesionesBorrar += $r.data.sesionId }
$nombresLargo = @($r.data.subtemas | ForEach-Object { $_.nombre })
$bloquesEquilibrado = [int]$r.data.analisis.bloques
Ok "crear con texto largo responde 200" ($r.status -eq 200 -and $r.data.sesionId -gt 0) "status=$($r.status) sesionId=$($r.data.sesionId)"
Ok "analiza el material en varios bloques" ($bloquesEquilibrado -ge 2) "bloques=$bloquesEquilibrado"
Ok "encuentra 8+ sub-temas (antes salían 4-5)" ($nombresLargo.Count -ge 8) "count=$($nombresLargo.Count)"
Ok "respeta el tope del preset equilibrado (10)" ($nombresLargo.Count -le 10) "count=$($nombresLargo.Count)"
$peor = ParMasParecido $nombresLargo
Ok "ningún par de sub-temas parecidos (similitud < 0.7)" ($peor.similitud -lt 0.7) "peor=$($peor.similitud) par=$($peor.par)"
Write-Host "        sub-temas: $($nombresLargo -join ' | ')"

$r2 = Llamar Get "/api/sesiones/$($r.data.sesionId)" $null
Ok "los sub-temas quedan guardados en la sesión" (@($r2.data.subtemas).Count -eq $nombresLargo.Count) "guardados=$(@($r2.data.subtemas).Count)"

$r = Llamar Post "/api/sesiones/crear" @{ texto = $textoLargo; modo = "apunte"; modeloPrincipal = $Modelo; preset = "rapido" }
if ($r.data.sesionId) { $sesionesBorrar += $r.data.sesionId }
Ok "preset rapido: analiza menos bloques" ([int]$r.data.analisis.bloques -lt $bloquesEquilibrado) "bloques=$($r.data.analisis.bloques) vs=$bloquesEquilibrado"
Ok "preset rapido: tope de 6 sub-temas" (@($r.data.subtemas).Count -le 6) "count=$(@($r.data.subtemas).Count)"
Ok "el preset vuelve normalizado" ($r.data.preset -eq "rapido") "preset=$($r.data.preset)"

$r = Llamar Post "/api/sesiones/crear" @{ texto = $texto; modo = "apunte"; modeloPrincipal = $Modelo; preset = "no-existe" }
if ($r.data.sesionId) { $sesionesBorrar += $r.data.sesionId }
Ok "preset desconocido cae en el default" ($r.data.preset -eq "equilibrado") "preset=$($r.data.preset)"

Write-Host "`n--- 6. Calidad del sondeo (Tanda 2) ---"
# Antes la anti-repetición era por sub-tema: al cambiar de sub-tema la misma pregunta
# volvía a salir, y las preguntas no traían explicación (el sondeo evaluaba, no enseñaba).
# Este bloque recorre el sondeo respondiendo siempre la correcta y junta todos los
# enunciados servidos para verificar que ninguno se repite en TODA la sesión.
$r = Llamar Post "/api/sesiones/crear" @{ texto = $texto; modo = "apunte"; modeloPrincipal = $Modelo; preset = "equilibrado" }
$sesionS = $r.data.sesionId
if ($sesionS) { $sesionesBorrar += $sesionS }
Ok "crear sesión para el sondeo" ($r.status -eq 200 -and $sesionS -gt 0) "status=$($r.status) sesionId=$sesionS"

$rutaSiguiente = "/api/sondeo/siguiente-pregunta?sesionId=$sesionS&modeloPreguntas=$Modelo&modeloPrincipal=$Modelo&preset=equilibrado&pregen=0"
$vistasQ = @()
$sinExplicacion = 0
$posiciones = @()
$preguntaActual = $null

if ($sesionS) {
  for ($i = 0; $i -lt 12; $i++) {
    if ($null -eq $preguntaActual) {
      $rq = Llamar Get $rutaSiguiente $null
      if (-not $rq.data -or $rq.data.completo -or -not $rq.data.pregunta) { break }
      $preguntaActual = $rq.data
    }
    $vistasQ += [string]$preguntaActual.pregunta.pregunta
    if ([string]::IsNullOrWhiteSpace([string]$preguntaActual.pregunta.explicacion)) { $sinExplicacion++ }
    $posiciones += [int]$preguntaActual.pregunta.indiceCorrecta

    # Se responde siempre la correcta (el objetivo acá es recorrer el sondeo, no evaluarlo).
    $correcta = [string]$preguntaActual.pregunta.opciones[[int]$preguntaActual.pregunta.indiceCorrecta]
    $rr = Llamar Post "/api/sondeo/responder" @{
      preguntaId = $preguntaActual.preguntaId
      opcionElegida = $correcta
      sesionId = $sesionS
      siguiente = $true
      preset = "equilibrado"
      pregen = $false
      modeloPreguntas = $Modelo
      modeloPrincipal = $Modelo
    }
    if ($rr.data -and $rr.data.siguiente -and -not $rr.data.siguiente.completo) {
      $preguntaActual = $rr.data.siguiente
    } else {
      $preguntaActual = $null
    }
  }
}

Ok "el sondeo sirvió varias preguntas" ($vistasQ.Count -ge 4) "count=$($vistasQ.Count)"
Ok "ninguna pregunta repetida en toda la sesión" ((ParMasParecido $vistasQ).similitud -lt 0.6) "peor=$((ParMasParecido $vistasQ).par)"
Ok "todas las preguntas traen explicación" ($vistasQ.Count -gt 0 -and $sinExplicacion -eq 0) "sinExplicacion=$sinExplicacion de $($vistasQ.Count)"
Write-Host "        preguntas: $($vistasQ -join ' | ')"

# Distribución de la correcta: si cae siempre en el mismo índice el usuario aprende la
# posición en vez del tema. `distribuirLote` (lib/ollama.ts) lo evita al recortar el lote.
$posicionesDistintas = @($posiciones | Select-Object -Unique)
$masRepetida = 0
if ($posiciones.Count -gt 0) { $masRepetida = ($posiciones | Group-Object | Sort-Object Count -Descending | Select-Object -First 1).Count }
Ok "la correcta no cae siempre en la misma posición" ($posiciones.Count -ge 3 -and $posicionesDistintas.Count -ge 2 -and $masRepetida -le ($posiciones.Count / 2 + 1)) "posiciones=$($posiciones -join ',')"

Write-Host "`n--- 7. Limpieza ---"
foreach ($id in $sesionesBorrar) {
  if ($id) { Llamar Post "/api/sesiones/eliminar" @{ sesionId = $id } | Out-Null }
}
Ok "sesiones de prueba eliminadas" $true

Write-Host ""
if ($errores.Count -eq 0) {
  Write-Host "SMOKE C1: TODO OK ($([datetime]::Now.ToString('HH:mm:ss')))"
  exit 0
} else {
  Write-Host "SMOKE C1: $($errores.Count) fallos → $($errores -join ' | ')" -ForegroundColor Red
  exit 1
}
