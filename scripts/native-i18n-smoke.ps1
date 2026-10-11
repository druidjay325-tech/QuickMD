param([string]$ProfileName='native-i18n-071')
$ErrorActionPreference='Stop'
if($ProfileName -notmatch '^native-i18n-[a-zA-Z0-9-]+$'){throw 'Unexpected validation profile name'}
$workspace=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$profile=Join-Path $workspace ('.scratch/'+$ProfileName)
if(Test-Path -LiteralPath $profile){throw 'Preserve the existing validation profile before rerunning.'}
New-Item -ItemType Directory -Path (Join-Path $profile '.config') | Out-Null
[IO.File]::WriteAllText((Join-Path $profile '.config/settings.json'),'{"locale":"system","autostart":false,"shortcut":"Ctrl+Alt+Shift+F12","auto_save":true,"custom_dir":null}',[Text.UTF8Encoding]::new($false))
$env:QUICKMD_DATA_DIR=$profile
$env:QUICKMD_SMOKE_CHECK='1'
$env:QUICKMD_SMOKE_SCENARIO='locale'
$env:QUICKMD_SYSTEM_LOCALE='en-US'
$binary=(Resolve-Path (Join-Path $workspace 'src-tauri/target/debug/quickmd.exe')).Path
$process=Start-Process -FilePath $binary -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
try{
  $deadline=[DateTime]::UtcNow.AddSeconds(60)
  $reportPath=Join-Path $profile '.runtime/locale-validation.json'
  do {
    $process.Refresh();if($process.HasExited){throw "Application exited: $($process.ExitCode)"}
    if(Test-Path -LiteralPath $reportPath){break}
    Start-Sleep -Milliseconds 250
  }while([DateTime]::UtcNow -lt $deadline)
  if(-not(Test-Path -LiteralPath $reportPath)){throw 'Native locale validation timed out'}
  $report=[IO.File]::ReadAllText($reportPath)|ConvertFrom-Json
  if($report.status -ne 'passed'){throw $report.error}
  foreach($pair in @(@('SOUL.md','WELCOME_CONTENT.en.md'),@('Markdown Guide.md','MD_GUIDE_CONTENT.en.md'))){
    if((Get-FileHash -LiteralPath (Join-Path $profile ('flashthoughts/'+$pair[0]))).Hash -ne (Get-FileHash -LiteralPath (Join-Path $workspace $pair[1])).Hash){throw 'Initial template content changed'}
  }
  $report|ConvertTo-Json -Depth 7
}finally{
  $process.Refresh();if(-not $process.HasExited){Stop-Process -Id $process.Id;$process.WaitForExit(5000)|Out-Null}
  foreach($key in @('QUICKMD_DATA_DIR','QUICKMD_SMOKE_CHECK','QUICKMD_SMOKE_SCENARIO','QUICKMD_SYSTEM_LOCALE')){Remove-Item -LiteralPath ('Env:'+ $key) -ErrorAction SilentlyContinue}
}
