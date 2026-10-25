$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../scripts/owner-confirm-buyermatch-s2.ps1')
. (Join-Path $PSScriptRoot '../scripts/owner-provision-buyermatch-s2.ps1')
$docs=@(@{id='terms';document_hash='dummy-terms'},@{id='privacy';document_hash='dummy-privacy'})
$passed=0
foreach($case in @('success','declined','plaintext','short-password','no-name','runner-error')){
 $script:reads=0;$script:runs=0;$failed=$false
 $read={param($label)
  $script:reads++
  if($case -eq 'plaintext'){return 'DUMMY_PLAIN'}
  $value=if($script:reads -eq 1){'DUMMY_OWNER_PASSWORD_123'}elseif($script:reads -eq 2){'Synthetic Owner'}else{''}
  if($case -eq 'short-password' -and $script:reads -eq 1){$value='short'}
  if($case -eq 'no-name' -and $script:reads -eq 2){$value=''}
  if($value -eq ''){return (New-Object Security.SecureString)}
  ConvertTo-SecureString $value -AsPlainText -Force
 }
 $consent={param($label) if($case -eq 'declined'){'NO'}else{'ACCEPT BOTH S2 QA FIXTURES'}}
 $run={param($json)
  $script:runs++
  if($case -eq 'runner-error'){throw 'DUMMY_PRIVATE_FAILURE'}
  $p=$json|ConvertFrom-Json
  if($p.password -cne 'DUMMY_OWNER_PASSWORD_123' -or $p.name -cne 'Synthetic Owner' -or $p.company -cne '' -or $p.acceptedBoth -ne $true -or @($p.documents).Count -ne 2){throw 'Private dummy payload mismatch'}
 }
 try{Invoke-S2ProvisionPrivateEntry -ReadPrivate $read -ReadConsent $consent -RunPrivate $run -ReviewedDocuments $docs}catch{$failed=$true}
 if($case -eq 'success'){if($failed -or $script:runs -ne 1){throw 'Successful private flow failed'}}
 elseif($case -eq 'runner-error'){if(!$failed -or $script:runs -ne 1){throw 'Runner failure lost'}}
 elseif(!$failed -or $script:runs -ne 0){throw 'Unsafe private input reached runner'}
 $passed++
}
$errors=$null;$tokens=$null
[void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../scripts/owner-provision-buyermatch-s2.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'PowerShell 5 parse failed'}
$passed++
Write-Output ('Owner provisioning private checks PASS: '+$passed+'; all values synthetic; no provider calls.')
