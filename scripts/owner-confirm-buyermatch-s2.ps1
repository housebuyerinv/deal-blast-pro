# Owner-run only. No elevation, persistent secret storage, email-hook change or browser bridge.
$ErrorActionPreference='Stop'
function Convert-S2PrivateValue([Security.SecureString]$Value) {
 $ptr=[IntPtr]::Zero
 try{$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value);[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
 finally{if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}}
}
function Invoke-S2OwnerPrivateEntry {
 param([scriptblock]$ReadPrivate,[scriptblock]$RunPrivate)
 $first=$null;$second=$null;$key=$null;$payload=$null
 try {
  $key=& $ReadPrivate 'Isolated S2 Resend sending-only key restricted to s2.housebuyerinvestments.com (private)'
  $first=& $ReadPrivate 'New S2 owner password (private; minimum 16 characters)'
  $second=& $ReadPrivate 'Confirm S2 owner password (private)'
  if($key -isnot [Security.SecureString] -or $first -isnot [Security.SecureString] -or $second -isnot [Security.SecureString]){throw 'Private entry unavailable'}
  $payload=@{resendKey=(Convert-S2PrivateValue $key);password=(Convert-S2PrivateValue $first);passwordConfirmation=(Convert-S2PrivateValue $second)}
  if($payload.password.Length -lt 16 -or $payload.password.Length -gt 1024 -or $payload.password -cne $payload.passwordConfirmation -or $payload.resendKey -cnotmatch '^re_[A-Za-z0-9_]{16,}$'){throw 'Private entries invalid; nothing sent'}
  & $RunPrivate ($payload|ConvertTo-Json -Compress)
 }finally{
  foreach($v in @($first,$second,$key)){if($v -is [Security.SecureString]){$v.Dispose()}}
  if($payload){$payload.Clear()};$payload=$null
 }
}
if($MyInvocation.InvocationName -ne '.') {
 $child=$null
 try {
  # Domain isolation is verified; explicit key/send-run authorization is pending.
  throw 'Isolated owner-confirmation execution is not authorized. No private entry or provider operation is permitted.'
  $node='C:\Program Files\nodejs\node.exe'
  $core=Join-Path $PSScriptRoot 'testing\s2-owner-confirmation.mjs'
  $pin='B5DAB415BBB4F162690A926021B29F4093320F2506879DA219B4F44CDF173FA1'
  if(!(Test-Path -LiteralPath $core -PathType Leaf) -or !(Test-Path -LiteralPath $node -PathType Leaf)){throw 'Verified dependency missing'}
  if((Get-FileHash -LiteralPath $core -Algorithm SHA256).Hash -cne $pin){throw 'Confirmation implementation changed'}
  if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -cne 'B3094D0B49F9AD602262A9921551737BB97637C05DD357A06AE98188D7290AA3'){throw 'Node fingerprint changed'}
  $cli='C:\Users\CTL Katastrophic\AppData\Roaming\npm\node_modules\supabase\dist\supabase.js'
  if(!(Test-Path -LiteralPath $cli -PathType Leaf) -or (Get-FileHash -LiteralPath $cli -Algorithm SHA256).Hash -cne '253CAA8C31EE5976322D04A8BD7752622C0915E7943DE3F74E2B73395C54A240'){throw 'Staging CLI dependency changed'}
  Write-Host 'One S2 owner confirmation only. This does not activate registration, billing or an owner role.'
  Write-Host 'Use only the NEW isolated-account sending-only key restricted to s2.housebuyerinvestments.com. Never use the old shared key.'
  $run={param($privateJson)
   if((Get-FileHash -LiteralPath $core -Algorithm SHA256).Hash -cne $pin -or (Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -cne 'B3094D0B49F9AD602262A9921551737BB97637C05DD357A06AE98188D7290AA3' -or (Get-FileHash -LiteralPath $cli -Algorithm SHA256).Hash -cne '253CAA8C31EE5976322D04A8BD7752622C0915E7943DE3F74E2B73395C54A240'){throw 'Verified dependency changed during private entry'}
   $psi=New-Object Diagnostics.ProcessStartInfo
   $psi.FileName=$node;$psi.Arguments='"'+$core+'"'
   $psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
   $psi.RedirectStandardInput=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
   $child=New-Object Diagnostics.Process;$child.StartInfo=$psi
   try {
    if(!$child.Start()){throw 'Private child did not start'}
    $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
    $child.StandardInput.Write($privateJson);$child.StandardInput.Close();$privateJson=$null
    if(!$child.WaitForExit(130000)){try{$child.Kill()}catch{};throw 'Result unknown; no retry'}
    $text=$stdout.GetAwaiter().GetResult();$errors=$stderr.GetAwaiter().GetResult()
    if($errors.Length -gt 0 -or $text.Length -gt 2048){throw 'Unexpected private child output; stop and review'}
    $r=$text|ConvertFrom-Json
    # Only the fixed sanitized result schema may be displayed; never echo child output.
    if($r.ok -eq $true -and $r.emailAccepted -eq $true -and $r.stage -ceq 'awaiting-private-owner-confirmation' -and $child.ExitCode -eq 0){
     Write-Host 'Resend accepted the one owner-confirmation message. Delivery and confirmation are not yet verified.'
     Write-Host 'Open the email privately and complete verification. Do not share the link, token, key or password.'
     Write-Host 'If the paused callback reports incomplete registration, do not retry signup. Report only that status.'
    }else{Write-Host 'STOP: operation failed or is unverified. A new unconfirmed S2 account may exist. Do not retry; request a read-only checkpoint.';exit 1}
   }finally{if($child){$child.Dispose()};$text=$null;$errors=$null;$privateJson=$null}
  }
  Invoke-S2OwnerPrivateEntry -ReadPrivate {param($label) Read-Host $label -AsSecureString} -RunPrivate $run
 }catch{
  Write-Host 'STOP: private owner setup did not complete. No automatic retry. Do not share private values or raw provider errors.'
  exit 1
 }
}
