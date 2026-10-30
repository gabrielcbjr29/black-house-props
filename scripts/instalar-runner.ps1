# Instala o runner proprio do GitHub Actions para o repositorio black-house-props
# neste computador (Windows x64), como servico que liga junto com o Windows.
#
# Como usar:
#   1. Clique com o botao direito no menu Iniciar -> "Terminal (Admin)" ou "Windows PowerShell (Admin)".
#   2. Va ate a pasta onde salvou este arquivo, por exemplo:  cd $HOME\Downloads
#   3. Rode:  powershell -ExecutionPolicy Bypass -File .\instalar-runner.ps1
#   4. Quando pedir, cole o codigo de registro (veja abaixo onde pegar).

$ErrorActionPreference = 'Stop'
$Repo      = 'gabrielcbjr29/black-house-props'
$RepoUrl   = "https://github.com/$Repo"
$Pasta     = 'C:\actions-runner'
$GitBin    = 'C:\Program Files\Git\bin'

function Passo($t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Cyan }
function Ok($t)    { Write-Host "    $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "    $t" -ForegroundColor Yellow }
function Falha($t) { Write-Host ""; Write-Host "ERRO: $t" -ForegroundColor Red; Read-Host "Pressione Enter para sair"; exit 1 }

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# 1. Administrador
Passo "Conferindo permissao de administrador"
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Falha "Abra o PowerShell como administrador (botao direito -> Executar como administrador) e rode de novo." }
Ok "PowerShell aberto como administrador."

# 2. Git (a coleta usa o bash do Git para Windows)
Passo "Conferindo o Git"
if (-not (Test-Path "$GitBin\bash.exe")) {
    Aviso "Git para Windows nao encontrado em C:\Program Files\Git."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        $r = Read-Host "    Instalar o Git agora pelo winget? (S/n)"
        if ($r -eq '' -or $r -match '^[sSyY]') {
            winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
        }
    }
    if (-not (Test-Path "$GitBin\bash.exe")) {
        Falha "Instale o Git em https://git-scm.com/download/win (opcoes padrao) e rode este script de novo."
    }
}
Ok "Git encontrado: $GitBin\bash.exe"

# 3. Pasta do runner
Passo "Preparando a pasta $Pasta"
if (Test-Path "$Pasta\.runner") {
    Falha "Ja existe um runner configurado em $Pasta. Para reinstalar, rode antes (como admin): cd $Pasta; .\config.cmd remove --token CODIGO"
}
New-Item -ItemType Directory -Force -Path $Pasta | Out-Null
Set-Location $Pasta
Ok "Pasta pronta."

# 4. Baixar a versao mais nova do runner (direto do GitHub, repositorio actions/runner)
Passo "Baixando o runner oficial do GitHub"
$rel   = Invoke-RestMethod -Uri 'https://api.github.com/repos/actions/runner/releases/latest' -Headers @{ 'User-Agent' = 'instalar-runner' }
$asset = $rel.assets | Where-Object { $_.name -match '^actions-runner-win-x64-[\d\.]+\.zip$' } | Select-Object -First 1
if (-not $asset) { Falha "Nao achei o pacote win-x64 na versao $($rel.tag_name)." }
$zip = Join-Path $Pasta $asset.name
if (-not (Test-Path $zip)) {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip
    $ProgressPreference = 'Continue'
}
Ok "Baixado: $($asset.name) ($([math]::Round($asset.size/1MB,1)) MB)"

# 5. Conferir a assinatura (SHA-256) informada pelo GitHub
$hash = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLower()
$esperado = $null
if ($asset.digest -and $asset.digest -like 'sha256:*') { $esperado = $asset.digest.Substring(7).ToLower() }
elseif ($rel.body -match ("(?i)" + [regex]::Escape($asset.name) + "[^0-9a-f]*([0-9a-f]{64})")) { $esperado = $Matches[1].ToLower() }
elseif ($rel.body -match '(?is)win-x64[^<]*?<!--\s*BEGIN SHA win-x64\s*-->([0-9a-f]{64})') { $esperado = $Matches[1].ToLower() }
if ($esperado) {
    if ($hash -ne $esperado) { Remove-Item $zip -Force; Falha "O arquivo baixado nao confere com a assinatura do GitHub. Rode de novo." }
    Ok "Assinatura SHA-256 conferida."
} else {
    Aviso "Nao consegui ler a assinatura oficial; seguindo com o pacote baixado de github.com/actions/runner."
}

# 6. Extrair
Passo "Extraindo"
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $Pasta)
Remove-Item $zip -Force
Ok "Runner extraido em $Pasta"

# 7. Codigo de registro (o usuario cola; vale 1 hora)
Passo "Codigo de registro"
Write-Host "    1. Abra:  $RepoUrl/settings/actions/runners/new?arch=x64&os=win"
Write-Host "    2. Na secao 'Configure', copie o codigo que aparece depois de  --token"
Write-Host "       (algo como AABCD...; vale por 1 hora e so serve uma vez)."
try { Start-Process "$RepoUrl/settings/actions/runners/new?arch=x64&os=win" } catch {}
$token = (Read-Host "    Cole o codigo aqui e aperte Enter").Trim()
if (-not $token) { Falha "Nenhum codigo informado." }

# 8. Configurar como servico do Windows
Passo "Registrando o runner no repositorio e instalando o servico"
& .\config.cmd --unattended --url $RepoUrl --token $token --name $env:COMPUTERNAME --work _work --runasservice --replace
if ($LASTEXITCODE -ne 0) { Falha "A configuracao falhou (veja a mensagem acima). Se o codigo expirou, gere outro e rode de novo." }
$token = $null

# 9. Garantir que 'bash' nos jobs seja o do Git (e nao o do WSL)
Passo "Ajustando o PATH dos jobs para usar o bash do Git"
$pathFile = Join-Path $Pasta '.path'
$atual = if (Test-Path $pathFile) { (Get-Content $pathFile -Raw).Trim() } else { $env:Path }
if ($atual -notlike "$GitBin;*") {
    Set-Content -Path $pathFile -Value "$GitBin;$atual" -NoNewline -Encoding ASCII
}
$svc = Get-Service -Name 'actions.runner.*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($svc) {
    Restart-Service -Name $svc.Name
    Ok "Servico '$($svc.Name)' reiniciado e rodando (inicia sozinho com o Windows)."
} else {
    Aviso "Nao achei o servico do runner. Confira em services.msc."
}

Write-Host ""
Write-Host "PRONTO! O runner aparece como 'Idle' em:" -ForegroundColor Green
Write-Host "  $RepoUrl/settings/actions/runners"
Write-Host "Para testar: Actions -> 'Atualizar dados e publicar' -> Run workflow."
Write-Host "Lembre: deixe o computador ligado e sem hibernar nos horarios de coleta."
Read-Host "Pressione Enter para fechar"
