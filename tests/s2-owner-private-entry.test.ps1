$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../scripts/owner-confirm-buyermatch-s2.ps1')
$passed=0
foreach($case in @('success','mismatch','short','invalid-key','plaintext-input','runner-failure')){
 $script:prompts=0;$script:calls=0;$failed=$false
 $read={param($label)
  $script:prompts++
  if($case -eq 'plaintext-input'){return 'DUMMY_PRIVATE_STRING'}
  $s=if($script:prompts -eq 1){'re_DUMMY_PRIVATE_KEY_123456789'}else{'DUMMY_PRIVATE_PASSWORD_123'}
  if($case -eq 'mismatch' -and $script:prompts -eq 3){$s='DUMMY_DIFFERENT_PASSWORD'}
  if($case -eq 'short' -and $script:prompts -gt 1){$s='short'}
  if($case -eq 'invalid-key' -and $script:prompts -eq 1){$s='invalid'}
  ConvertTo-SecureString $s -AsPlainText -Force
 }
 $run={param($json)
  $script:calls++
  if($case -eq 'runner-failure'){throw 'DUMMY_PRIVATE_FAILURE'}
  $v=$json|ConvertFrom-Json
  if($v.password -cne 'DUMMY_PRIVATE_PASSWORD_123' -or $v.resendKey -cne 're_DUMMY_PRIVATE_KEY_123456789'){throw 'Dummy transport assertion failed'}
 }
 try{Invoke-S2OwnerPrivateEntry -ReadPrivate $read -RunPrivate $run}catch{$failed=$true}
 if($case -eq 'success'){if($failed -or $script:calls -ne 1){throw 'Successful private transport failed'}}
 elseif($case -eq 'runner-failure'){if(!$failed -or $script:calls -ne 1){throw 'Failure not preserved'}}
 elseif(!$failed -or $script:calls -ne 0){throw 'Unsafe private input reached child'}
 $passed++
}
$psi=New-Object Diagnostics.ProcessStartInfo
$psi.FileName='C:\Program Files\nodejs\node.exe'
$js="let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>process.stdout.write(JSON.stringify({privateInput:JSON.parse(s).password.length===15})))"
$psi.Arguments='-e "'+$js+'"'
$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
$psi.RedirectStandardInput=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
$p=New-Object Diagnostics.Process;$p.StartInfo=$psi
try {
 if(!$p.Start()){throw 'Dummy pipe child missing'}
 $out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync()
 $p.StandardInput.Write('{"password":"DUMMY_PIPE_ONLY"}');$p.StandardInput.Close()
 if(!$p.WaitForExit(5000)){try{$p.Kill()}catch{};throw 'Dummy pipe timeout'}
 $result=$out.GetAwaiter().GetResult()|ConvertFrom-Json
 if($p.ExitCode -ne 0 -or !$result.privateInput -or $err.GetAwaiter().GetResult().Length -ne 0 -or $psi.Arguments.Contains('DUMMY_PIPE_ONLY')){throw 'Dummy private pipe check failed'}
 $passed++
}finally{$p.Dispose()}
Write-Output ('PowerShell private-entry checks PASS: '+$passed+'; all credentials synthetic; no provider request.')
