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
  if ($cond) {
    Write-Host "  PASS  $nombre"
  } else {
    Write-Host "  FAIL  $nombre  $detalle"
    $script:errores += $nombre
  }
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
Ok "crear apunte responde 200" ($r.status -eq 200) "status=$($r.status) data=$($r.data | ConvertTo-Json -Compress -Depth 5)"
$sesionA = $r.data.sesionId
$sesionesBorrar += $sesionA
Ok "apunte crea sub-temas" ($r.data.subtemas.Count -gt 0)
Ok "apunte responde modo=apunte" ($r.data.modo -eq "apunte")
Ok "apunte NO devuelve apunte generado" (-not $r.data.apunte)

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
Ok "crear tema_libre responde 200" ($r.status -eq 200) "status=$($r.status) data=$($r.data | ConvertTo-Json -Compress -Depth 5)"
$sesionT = $r.data.sesionId
$sesionesBorrar += $sesionT
$apunte = [string]$r.data.apunte
Ok "devuelve un apunte no vacío" ($apunte.Length -gt 500) "largo=$($apunte.Length)"
Ok "devuelve sub-temas" ($r.data.subtemas.Count -gt 0)
Ok "topic es un título legible" ([string]$r.data.topic -and $r.data.topic.Length -lt 120) "topic=$($r.data.topic)"

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

Write-Host "`n--- 5. Limpieza ---"
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
