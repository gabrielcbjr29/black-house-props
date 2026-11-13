# Instala o leitor da 99play no Windows: copia os arquivos para %LOCALAPPDATA%\BlackHouse, guarda o token e cria
# a tarefa "Black House - Linhas 99play" no Agendador de Tarefas, de hora em hora aos :35, mesmo na bateria, e
# acordando o computador se ele estiver em suspensão. Não precisa de administrador.
# Uso (PowerShell): powershell -ExecutionPolicy Bypass -File .\instalar.ps1
param([string]$Token = '__C99_TOKEN__')
$ErrorActionPreference = 'Stop'
$DIR = Join-Path $env:LOCALAPPDATA 'BlackHouse'
New-Item -ItemType Directory -Force -Path $DIR | Out-Null
$src = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'leitor99.ps1'
if (Test-Path $src) { Copy-Item $src (Join-Path $DIR 'leitor99.ps1') -Force } else { [IO.File]::WriteAllText((Join-Path $DIR 'leitor99.ps1'), $LEITOR, (New-Object Text.UTF8Encoding $true)) }
if ($Token -like '__*') { $Token = Read-Host 'Cole o token da 99play (C99_TOKEN)' }
Set-Content -Path (Join-Path $DIR 'token.txt') -Value $Token.Trim() -Encoding ascii
$act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$DIR\leitor99.ps1`""
$trg = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(35) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$set = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Black House - Linhas 99play' -Action $act -Trigger $trg -Settings $set -Description 'Lê as linhas de jogador da NBA na 99play de hora em hora e manda para o Black House.' -Force | Out-Null
Write-Host ''
Write-Host 'Tarefa criada: roda de hora em hora, aos 35 minutos.' -ForegroundColor Green
Write-Host 'Fazendo a primeira leitura agora (leva uns 10 segundos)...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$DIR\leitor99.ps1"
Write-Host ''
Get-Content (Join-Path $DIR 'leitor99.log') -Encoding utf8 -Tail 1
Write-Host ''
Write-Host 'Pronto. Se a linha acima começa com "ok", está funcionando. Pode fechar esta janela.' -ForegroundColor Green
