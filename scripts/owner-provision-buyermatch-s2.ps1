param([switch]$PreflightOnly)
$ErrorActionPreference='Stop'
function Invoke-S2ProvisionPrivateEntry {
 param([scriptblock]$ReadPrivate,[scriptblock]$ReadConsent,[scriptblock]$RunPrivate,$ReviewedDocuments)
 $password=$null;$name=$null;$company=$null;$payload=$null
 try{
  if(@($ReviewedDocuments).Count -ne 2){throw 'Reviewed documents unavailable'}
  $password=& $ReadPrivate 'Existing confirmed S2 owner password (private; no reset or email)'
  $name=& $ReadPrivate 'Your actual typed name for acceptance of BOTH displayed S2 QA fixtures (private)'
  $company=& $ReadPrivate 'Workspace/company label (private; blank is allowed)'
  if($password -isnot [Security.SecureString] -or $name -isnot [Security.SecureString] -or $company -isnot [Security.SecureString]){throw 'Private entry unavailable'}
  $consent=& $ReadConsent 'After personally reviewing BOTH displayed S2 QA fixtures, type ACCEPT BOTH S2 QA FIXTURES to accept those exact versions. Anything else cancels.'
  if($consent -cne 'ACCEPT BOTH S2 QA FIXTURES'){throw 'No affirmative consent; no provisioning'}
  $payload=@{password=(Convert-S2PrivateValue $password);name=(Convert-S2PrivateValue $name).Trim();company=(Convert-S2PrivateValue $company).Trim();acceptedBoth=$true;acceptedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();documents=@($ReviewedDocuments|ForEach-Object {@{id=$_.id;hash=$_.document_hash}})}
  if($payload.password.Length -lt 16 -or $payload.password.Length -gt 1024 -or $payload.name.Length -lt 2 -or $payload.name.Length -gt 200 -or $payload.company.Length -gt 200){throw 'Private prerequisites incomplete'}
  & $RunPrivate ($payload|ConvertTo-Json -Depth 5 -Compress)
 }finally{
  foreach($v in @($password,$name,$company)){if($v -is [Security.SecureString]){$v.Dispose()}}
  if($payload){$payload.Clear()};$payload=$null
 }
}
if($MyInvocation.InvocationName -ne '.'){
 $previousModulePath=$env:PSModulePath
 if($PSVersionTable.PSEdition -ceq 'Desktop'){$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')}
 $progress=@{stage='preflight';rpcOutcome='NOT_ATTEMPTED'}
 $journal=Join-Path $PSScriptRoot ('..\artifacts\buyermatch-1b\owner-provision-local-'+[guid]::NewGuid().ToString('N')+'.json')
 $record={param($status) [IO.File]::WriteAllText($journal,(@{status=$status;stage=$progress.stage;rpcOutcome=$progress.rpcOutcome;time=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))}
 try{
  $node='C:\Program Files\nodejs\node.exe'
  $core=Join-Path $PSScriptRoot 'testing\s2-owner-provision.mjs'
  $relay=Join-Path $PSScriptRoot 'owner-confirm-buyermatch-s2.ps1'
  $intent=Join-Path $PSScriptRoot '..\api\_registrationIntent.ts'
  $cli='C:\Users\CTL Katastrophic\AppData\Roaming\npm\node_modules\supabase\dist\supabase.js'
  $pins=@{}
  $pins[$node]='B3094D0B49F9AD602262A9921551737BB97637C05DD357A06AE98188D7290AA3'
  $pins[$core]='C927F35A61F632C2558D7B86FA868BA9AE2A836DE7367F77990D2598804F3C62'
  $pins[$relay]='01BADE379153884C91353B76BC5BABA35CDA7980A5CEF30A6B2C8DF4081FFA65'
  $pins[$intent]='88707BC9034A27EBDB75A6BE7783439CB4D98682A9FA9E403E66E669D54E8A76'
  $pins[$cli]='253CAA8C31EE5976322D04A8BD7752622C0915E7943DE3F74E2B73395C54A240'
  $verify={foreach($path in $pins.Keys){if(!(Test-Path -LiteralPath $path -PathType Leaf) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -cne $pins[$path]){throw 'Verified dependency changed'}}}
  & $verify
  if($PreflightOnly){& $record 'PREFLIGHT_ONLY_PASS';Write-Host 'PASS: owner-provision dependencies verified; no credential input or provider operation.';return}
  $baseline=Join-Path $PSScriptRoot '..\artifacts\buyermatch-1b\s2-owner-provision-baseline.json'
  $baselineHash=(Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant()
  . $relay
  $invoke={param($mode,$privateJson)
   & $verify
   if((Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant() -cne $baselineHash){throw 'Run preflight changed'}
   $psi=New-Object Diagnostics.ProcessStartInfo
   $psi.FileName=$node;$psi.Arguments='"'+$core+'" '+$mode+' '+$baselineHash
   $psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
   $psi.RedirectStandardInput=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
   $child=New-Object Diagnostics.Process;$child.StartInfo=$psi
   try{
    if(!$child.Start()){throw 'Private child unavailable'}
    $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
    if($mode -ceq '--provision'){$child.StandardInput.Write($privateJson)}
    $child.StandardInput.Close();$privateJson=$null
    if(!$child.WaitForExit(240000)){try{$child.Kill()}catch{};throw 'Outcome unknown; do not retry'}
    $text=$stdout.GetAwaiter().GetResult();$errors=$stderr.GetAwaiter().GetResult()
    if($errors.Length -gt 0 -or $text.Length -gt 32000){throw 'Unexpected child output'}
    $r=$text|ConvertFrom-Json
    if(!$r.ok -or $child.ExitCode -ne 0){throw 'Operation failed or uncertain; read state before retry'}
    return $r
   }finally{$child.Dispose();$text=$null;$errors=$null;$privateJson=$null}
  }
  $progress.stage='review-documents'
  $review=& $invoke '--review' $null
  if($review.stage -cne 'review-only-no-write' -or @($review.documents).Count -ne 2){throw 'Review unavailable'}
  Write-Host 'ISOLATED S2 OWNER SETUP ONLY. No public registration, payment or Production legal approval.'
  foreach($d in $review.documents){Write-Host ('--- '+$d.kind+' / '+$d.version+' / SHA256 '+$d.document_hash+' ---');Write-Host $d.content}
  $progress.stage='private-authentication-and-consent'
  & $record 'WAITING_FOR_PRIVATE_OWNER'
  $run={param($json)
   $progress.stage='authenticate-and-provision';$progress.rpcOutcome='UNKNOWN_UNTIL_READBACK'
   & $record 'RUNNING'
   $r=& $invoke '--provision' $json
   if($r.verified -ne $true -or $r.localSessionClosed -ne $true -or $r.stage -cnotin @('provisioned-and-verified','already-exact-no-write')){throw 'Independent readback required'}
   $progress.stage=$r.stage;$progress.rpcOutcome='VERIFIED'
   & $record 'VERIFIED_LOCAL_SESSION_CLOSED'
   Write-Host 'S2 owner application state verified; coordinator-only authentication session closed.'
   Write-Host 'No registration or billing gate was opened. Normal browser login remains a separate verification.'
  }
  Invoke-S2ProvisionPrivateEntry -ReadPrivate {param($label) Read-Host $label -AsSecureString} -ReadConsent {param($label) Read-Host $label} -RunPrivate $run -ReviewedDocuments $review.documents
 }catch{
  try{& $record 'FAILED_OR_UNKNOWN'}catch{}
  Write-Host ('STOP: S2 owner setup did not complete. Non-secret stage: '+$progress.stage+'. Do not rerun; request read-only state verification.')
  exit 1
 }finally{$env:PSModulePath=$previousModulePath}
}
