$ErrorActionPreference='Stop'
$wrapper=Join-Path $PSScriptRoot '../scripts/owner-confirm-buyermatch-s2.ps1'
$source=[IO.File]::ReadAllText($wrapper)
$parseErrors=$null;$tokens=$null
[void][Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'PowerShell 5 parsing failed'}
$exe=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$result=& $exe -NoLogo -NoProfile -NonInteractive -File $wrapper -PreflightOnly
if($LASTEXITCODE -ne 0 -or ($result -join '') -cne 'PASS: dependencies verified; no private input or provider operation.'){throw 'Read-only actual preflight failed'}
$fixture=Join-Path (Split-Path $wrapper) ('.owner-preflight-test-'+[guid]::NewGuid().ToString('N')+'.ps1')
try{
 # Literal replacement avoids treating the PowerShell variable as a regex escape.
 $bad=$source.Replace("`$pin='2EC6EBF9D360997D04986C2116659CC7D84ECF2B2E065266ECD2FEAEBD2294BF'",("`$pin='"+('0'*64)+"'"))
 if($bad -ceq $source){throw 'Negative fixture unchanged'}
 [IO.File]::WriteAllText($fixture,$bad,[Text.UTF8Encoding]::new($false))
 $result=& $exe -NoLogo -NoProfile -NonInteractive -File $fixture -PreflightOnly
 if($LASTEXITCODE -ne 1 -or ($result -join '') -cnotmatch 'Non-secret failure stage: core-pin'){throw 'Wrong-pin preflight did not stop safely'}
}finally{if(Test-Path -LiteralPath $fixture){Remove-Item -LiteralPath $fixture}}
if($source -notmatch 'WAITING_FOR_PRIVATE_ENTRY' -or $source -notmatch 'ACCEPTED_NOT_CONFIRMED' -or $source -match 'Write-Host\s+\$_'){throw 'Sanitized checkpoint contract failed'}
$before=$env:PSModulePath
$psi=New-Object Diagnostics.ProcessStartInfo
$psi.FileName=$exe;$psi.Arguments='-NoLogo -NoProfile -NonInteractive -File "'+$wrapper+'" -PreflightOnly'
$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
$psi.EnvironmentVariables['PSModulePath']='C:\DUMMY_INVALID_MODULE_PATH'
$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
$child=New-Object Diagnostics.Process;$child.StartInfo=$psi
try{
 if(!$child.Start()){throw 'Cross-version preflight child missing'}
 $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
 if(!$child.WaitForExit(15000)){try{$child.Kill()}catch{};throw 'Cross-version preflight timeout'}
 if($child.ExitCode -ne 0 -or $stdout.GetAwaiter().GetResult().Trim() -cne 'PASS: dependencies verified; no private input or provider operation.' -or $stderr.GetAwaiter().GetResult().Length -ne 0 -or $env:PSModulePath -cne $before){throw 'Inherited bad module path was not contained'}
}finally{$child.Dispose()}
Write-Output 'Owner preflight checks PASS: 5; no private input or provider request.'
