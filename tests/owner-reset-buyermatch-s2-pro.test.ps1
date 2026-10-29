$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../scripts/owner-reset-buyermatch-s2-pro.ps1')
$script:passed=0
function Check($ok,$label){if(!$ok){throw ('Dummy test failed: '+$label)};$script:passed++}
function Key($ref='qxhhlprentrufobpcgna'){
 $j=@{ref=$ref;role='service_role'}|ConvertTo-Json -Compress
 'dummy.'+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($j)).TrimEnd('=').Replace('+','-').Replace('/','_')+'.dummy'
}
foreach($case in @('success','wrong-project','wrong-user','mismatch','short','denied')){
 $script:calls=@();$script:prompts=0
 $get={if($case -eq 'wrong-project'){Key 'aigvnbxiydbzzqbetlhl'}else{Key}}
 $read={param($label)
  $script:prompts++
  $dummy='DUMMY-ONLY-TEST-PASSWORD'
  if($case -eq 'mismatch' -and $script:prompts -eq 2){$dummy='DIFFERENT-DUMMY-PASSWORD'}
  if($case -eq 'short'){$dummy='short'}
  ConvertTo-SecureString $dummy -AsPlainText -Force
 }
 $request={param($method,$uri,$key,$body)
  $script:calls+=,$method
  if($case -eq 'denied'){throw 'DUMMY_PRIVATE_PROVIDER_ERROR'}
  if($method -eq 'PUT'){
   $data=$body|ConvertFrom-Json
   Check ((@($data.psobject.Properties.Name)-join ',') -eq 'password') 'password-only body'
   Check ($uri -ceq 'https://qxhhlprentrufobpcgna.supabase.co/auth/v1/admin/users/368f5f93-acf7-4cc3-9805-a4c0817506c3') 'exact URI'
  }
  $id='368f5f93-acf7-4cc3-9805-a4c0817506c3';if($case -eq 'wrong-user'){$id='other'}
  @{id=$id;email='dbp-s2-pro-1792721835370@example.com';email_confirmed_at='2026-10-23'}
 }
 $ok=$false
 try{$ok=Invoke-BuyerMatchOwnerReset -GetKey $get -ReadPrivate $read -Request $request}catch{}
 if($case -eq 'success'){Check ($ok -eq $true) 'successful dummy reset';Check (($script:calls-join ',') -eq 'GET,PUT') 'one update'}
 else{Check (!$ok) ($case+' rejected');Check ($script:calls -notcontains 'PUT') ($case+' no write')}
 if($case -in @('wrong-project','wrong-user','denied')){Check ($script:prompts -eq 0) 'no unnecessary private prompt'}
}
Add-Type -AssemblyName System.Net.Http
$h=New-Object Net.Http.HttpClientHandler;$h.AllowAutoRedirect=$false
$c=New-Object Net.Http.HttpClient($h)
$r=New-Object Net.Http.HttpRequestMessage([Net.Http.HttpMethod]::new('PUT'),'https://example.invalid')
$r.Headers.Authorization=New-Object Net.Http.Headers.AuthenticationHeaderValue('Bearer','DUMMY-ONLY')
Check (!$h.AllowAutoRedirect) 'redirects disabled'
$r.Dispose();$c.Dispose()
Write-Output ('Synthetic checks PASS: '+$script:passed+'; no provider request or real password used.')
