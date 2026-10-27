param([Parameter(Mandatory=$true)][string]$Plan,[Parameter(Mandatory=$true)][string]$PlanHash,[Parameter(Mandatory=$true)][string]$WorkerHash,[switch]$PreflightOnly)
$ErrorActionPreference='Stop'
$password=$null;$payload=$null;$ptr=[IntPtr]::Zero;$child=$null
try {
  if(!$PreflightOnly){try{$Host.UI.RawUI.WindowTitle='BuyerMatch S2 - Pro verification (NO PAYMENTS)'}catch{}}
  $node='C:/Program Files/nodejs/node.exe'
  $cli='C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/vercel/dist/vc.js'
  $worker=Join-Path $PSScriptRoot 's2-pro-denials.mjs'
  if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine 'b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3' -or
     (Get-FileHash -LiteralPath $cli -Algorithm SHA256).Hash -ine '33542f1ec34ec6b9953ee7486c7ae5f9cc2a2b0225671ece4ed22fe8625bab86' -or
     (Get-FileHash -LiteralPath $worker -Algorithm SHA256).Hash -ine $WorkerHash -or
     (Get-FileHash -LiteralPath $Plan -Algorithm SHA256).Hash -ine $PlanHash){throw 'Dependency verification failed'}
  $p=Get-Content -LiteralPath $Plan -Raw | ConvertFrom-Json
  if($p.source -cne '4e79c99ac98d13bb030076aaf55a8289934d9ae4' -or $p.scope -cne 'payment-free-preflight' -or
    $p.project -cne 'prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl' -or $p.database -cne 'qxhhlprentrufobpcgna'){throw 'Plan scope failed'}
  if($PreflightOnly){Write-Host 'PASS: private Pro-login dependencies pinned; no input or provider call.';return}
  Write-Host 'S2 PAYMENT-FREE DENIAL CHECKS ONLY. No reset, purchase, Stripe session, migration or Production change.'
  Write-Host 'Existing fixture: dbp-s2-pro-1792721835370@example.com'
  Write-Host 'One normal password sign-in; no automatic retry. The temporary local Auth session will be signed out.'
  $password=Read-Host 'Existing Pro fixture password (private)' -AsSecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
  $payload=@{password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)} | ConvertTo-Json -Compress
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$ptr=[IntPtr]::Zero;$password.Dispose();$password=$null
  $psi=New-Object Diagnostics.ProcessStartInfo
  $psi.FileName=$node
  $psi.Arguments='"'+$cli+'" env run --project prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl --environment preview --scope housebuyerinv -- "'+$node+'" "'+$worker+'" "'+$Plan+'" '+$PlanHash
  $psi.WorkingDirectory=Join-Path $PSScriptRoot 'env-empty'
  $psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardInput=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
  $psi.EnvironmentVariables.Clear()
  foreach($name in @('SYSTEMROOT','WINDIR','SYSTEMDRIVE','COMSPEC','PATHEXT','PATH','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','HOMEDRIVE','HOMEPATH','USERNAME','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS')){ $value=[Environment]::GetEnvironmentVariable($name);if($null -ne $value){$psi.EnvironmentVariables[$name]=$value} }
  $child=New-Object Diagnostics.Process;$child.StartInfo=$psi
  if(!$child.Start()){throw 'Private process unavailable'}
  $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
  $child.StandardInput.Write($payload);$child.StandardInput.Close();$payload=$null
  if(!$child.WaitForExit(180000)){try{$child.Kill()}catch{};throw 'Outcome unknown; no retry'}
  $raw=$stdout.GetAwaiter().GetResult();$discard=$stderr.GetAwaiter().GetResult();$discard=$null
  if($raw.Length -gt 32768){throw 'Output limit'}
  $r=$raw | ConvertFrom-Json;$raw=$null
  if($child.ExitCode -ne 0 -or $r.status -cne 'HOSTED_PAYMENT_FREE_CHECKS_PASS' -or $r.fixtureVerified -ne $true -or $r.localAuthSessionClosed -ne $true){throw 'A required check did not pass'}
  Write-Host 'PASS: normal Pro identity, authenticated denied routes and local Auth sign-out verified. Coordinator will inspect sanitized evidence.'
} catch {
  Write-Host 'STOP: payment-free checks failed or are unknown. Do not rerun or disclose private input/provider errors.'
  exit 2
} finally {
  if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
  if($password -is [Security.SecureString]){$password.Dispose()}
  $payload=$null;if($child){$child.Dispose()}
  if(!$PreflightOnly -and $p -and $p.source -ceq '4e79c99ac98d13bb030076aaf55a8289934d9ae4' -and $p.scope -ceq 'payment-free-preflight'){
    $close=Join-Path $PSScriptRoot 'close.request'
    if(!(Test-Path -LiteralPath $close)){try{$file=[IO.File]::Open($close,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$b=[Text.UTF8Encoding]::new($false).GetBytes((@{source=$p.source;runId=$p.runId}|ConvertTo-Json -Compress));$file.Write($b,0,$b.Length);$file.Flush($true)}finally{$file.Dispose()}}catch{}}
  }
}
