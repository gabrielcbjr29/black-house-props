# Leitor das linhas de jogador da 99play (Black House) para Windows.
# Roda de hora em hora pelo Agendador de Tarefas (veja instalar.ps1), na internet de casa do usuário, como o
# próprio site faz no navegador, e manda a foto para a função c99-ingest do Supabase. Não precisa do app do Claude.
# O token (C99_TOKEN da tabela bot_config) fica em token.txt, na mesma pasta; nunca no repositório.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$LOG = Join-Path $DIR 'leitor99.log'
function Log([string]$m) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Out-File -FilePath $LOG -Append -Encoding utf8
  $l = @(Get-Content $LOG -Encoding utf8); if ($l.Count -gt 600) { $l[-400..-1] | Set-Content $LOG -Encoding utf8 }
}
function AsUtc($v) {
  if ($v -is [datetime]) { return [DateTimeOffset]$v.ToUniversalTime() }
  return [DateTimeOffset]::Parse([string]$v, [Globalization.CultureInfo]::InvariantCulture)
}
try {
  $TOKEN = (Get-Content (Join-Path $DIR 'token.txt') -Raw).Trim()
  $BASE = 'https://sb2frontend-altenar2.biahosted.com/api/widget/'
  $QS = 'culture=pt-BR&timezoneOffset=180&integration=24games1&deviceType=1&numFormat=en-GB&countryCode=BR'
  $TYPES = @(768, 772, 770, 774, 773, 771, 25050, 2312, 2313, 2314, 2315, 2317, 2318, 2322, 30070, 30071, 30072, 30073, 30078)
  $ev = Invoke-RestMethod -Uri ($BASE + "GetEvents?$QS&eventCount=0&sportId=0&champIds=2980") -TimeoutSec 40
  $now = [DateTimeOffset]::UtcNow
  $events = @()
  foreach ($e in @($ev.events)) {
    if ($e.champId -ne 2980) { continue }
    $t = AsUtc $e.startDate
    if ($t -le $now -or $t -ge $now.AddHours(36)) { continue }
    $events += , ([ordered]@{ id = $e.id; champId = $e.champId; startDate = $(if ($e.startDate -is [datetime]) { $t.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ') } else { [string]$e.startDate }); competitorIds = @($e.competitorIds) })
  }
  if ($events.Count -eq 0) { Log 'sem jogos da NBA abertos na 99play agora (nada enviado)'; exit 0 }
  $details = @{}; $erros = @()
  foreach ($e in $events) {
    try {
      $d = Invoke-RestMethod -Uri ($BASE + "GetEventDetails?$QS&eventId=$($e.id)") -TimeoutSec 40
      $cm = @(); $ids = New-Object 'System.Collections.Generic.HashSet[string]'
      foreach ($m in @($d.childMarkets)) {
        if ($TYPES -notcontains [int]$m.typeId) { continue }
        $cm += , ([ordered]@{ typeId = $m.typeId; childName = $m.childName; sv = $m.sv; desktopOddIds = $m.desktopOddIds })
        foreach ($x in @($m.desktopOddIds)) { foreach ($y in @($x)) { [void]$ids.Add([string]$y) } }
      }
      $odds = @()
      foreach ($o in @($d.odds)) { if ($ids.Contains([string]$o.id)) { $odds += , ([ordered]@{ id = $o.id; typeId = $o.typeId; price = $o.price; oddStatus = $o.oddStatus }) } }
      $details["$($e.id)"] = [ordered]@{ childMarkets = $cm; odds = $odds }
    } catch { $erros += "$($e.id): $($_.Exception.Message)" }
    Start-Sleep -Milliseconds 400   # sem pressa: um jogo de cada vez
  }
  $comp = @(); foreach ($c in @($ev.competitors)) { $comp += , ([ordered]@{ id = $c.id; name = $c.name; abbreviation = $c.abbreviation }) }
  $body = [ordered]@{ at = $now.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ss.fffZ'); fonte = 'windows'; events = $events; competitors = $comp; details = $details; erros = $erros }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 12 -Compress))
  $r = Invoke-RestMethod -Method Post -Uri "https://brtexfomhlvltdsuezsi.supabase.co/functions/v1/c99-ingest?token=$TOKEN" -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 90
  Log "ok: $($r.jogos) jogos, $($r.mercados) mercados$(if ($erros.Count) { ' (' + $erros.Count + ' jogos com erro)' })"
} catch {
  Log "ERRO: $($_.Exception.Message)"
  exit 1
}
