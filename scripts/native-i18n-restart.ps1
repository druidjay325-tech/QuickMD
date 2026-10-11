param([string]$ProfileName='native-i18n-071')
$ErrorActionPreference='Stop'
if($ProfileName -notmatch '^native-i18n-[a-zA-Z0-9-]+$'){throw 'Unexpected validation profile name'}
$workspace=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$binary=(Resolve-Path (Join-Path $workspace 'src-tauri/target/debug/quickmd.exe')).Path
$results=@()
foreach($kind in @('restart','legacy')){
  $profile=Join-Path $workspace ('.scratch/'+$ProfileName+$(if($kind -eq 'legacy'){'-legacy'}else{''}))
  if($kind -eq 'legacy'){
    if(Test-Path -LiteralPath $profile){throw 'Preserve existing legacy profile'}
    New-Item -ItemType Directory -Path (Join-Path $profile '.config') | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $profile 'flashthoughts') | Out-Null
    [IO.File]::WriteAllText((Join-Path $profile '.config/settings.json'),'{"autostart":false,"shortcut":"Ctrl+Alt+Shift+F11","auto_save":true,"custom_dir":null}',[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $profile '.initial-documents-v1.json'),'{"version":1}',[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $profile 'flashthoughts/SOUL.md'),'USER CUSTOM ORIGINAL', [Text.UTF8Encoding]::new($false))
    Copy-Item -LiteralPath (Join-Path $workspace 'MD_GUIDE_CONTENT.md') -Destination (Join-Path $profile 'flashthoughts/Markdown 语法指南.md')
  }
  $notes=Join-Path $profile 'flashthoughts'
  $before=@(Get-ChildItem -LiteralPath $notes -Filter '*.md' | ForEach-Object {[pscustomobject]@{Name=$_.Name;Hash=(Get-FileHash -LiteralPath $_.FullName).Hash}})
  $env:QUICKMD_DATA_DIR=$profile;$env:QUICKMD_SMOKE_CHECK='1';$env:QUICKMD_SYSTEM_LOCALE='fr-FR'
  Remove-Item Env:QUICKMD_SMOKE_SCENARIO -ErrorAction SilentlyContinue
  $started=[DateTime]::UtcNow
  $process=Start-Process -FilePath $binary -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
  try{
    $expected='en'
    $deadline=[DateTime]::UtcNow.AddSeconds(30)
    do{
      $ready=$true
      foreach($label in @('main','float')){
        $file=Join-Path $profile ".runtime/ui-$label.json"
        if(-not(Test-Path -LiteralPath $file) -or (Get-Item -LiteralPath $file).LastWriteTimeUtc -lt $started){$ready=$false;break}
        $ui=[IO.File]::ReadAllText($file)|ConvertFrom-Json
        if($ui.locale -ne $expected){$ready=$false;break}
      }
      if(-not $ready){Start-Sleep -Milliseconds 200}
    }while((-not $ready) -and [DateTime]::UtcNow -lt $deadline)
    if(-not $ready){throw "Both windows did not restore $expected"}
    foreach($entry in $before){if((Get-FileHash -LiteralPath (Join-Path $notes $entry.Name)).Hash -ne $entry.Hash){throw 'A note changed during restart'}}
    if(@(Get-ChildItem -LiteralPath $notes -Filter '*.md').Count -ne $before.Count){throw 'Restart changed initial documents'}
    $native=[IO.File]::ReadAllText((Join-Path $profile '.runtime/locale-native.json'))|ConvertFrom-Json
    $results+=[pscustomobject]@{scenario=$kind;locale=$expected;traySettings=$native.settings;notesUnchanged=$true;noteCount=$before.Count}
  }finally{
    $process.Refresh();if(-not $process.HasExited){Stop-Process -Id $process.Id;$process.WaitForExit(5000)|Out-Null}
  }
}
foreach($key in @('QUICKMD_DATA_DIR','QUICKMD_SMOKE_CHECK','QUICKMD_SYSTEM_LOCALE')){Remove-Item -LiteralPath ('Env:'+ $key) -ErrorAction SilentlyContinue}
$results|ConvertTo-Json -Depth 4
