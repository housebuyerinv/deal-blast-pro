# Owner-run only. No elevation, email, browser bridge, key export or provider setup.
# Dot-source for dummy tests; normal execution privately prompts the operator.
$ErrorActionPreference='Stop'
function Invoke-BuyerMatchOwnerReset {
 param([scriptblock]$GetKey,[scriptblock]$Request,[scriptblock]$ReadPrivate)
 $ref='qxhhlprentrufobpcgna';$id='368f5f93-acf7-4cc3-9805-a4c0817506c3'
 $email='dbp-s2-pro-1792721835370@example.com'
 $uri='https://'+$ref+'.supabase.co/auth/v1/admin/users/'+$id
 $key=$null;$first=$null;$second=$null;$p=$null;$q=$null;$body=$null
 $ptr=[IntPtr]::Zero;$ptr2=[IntPtr]::Zero
 try {
  $key=& $GetKey
  $parts=$key.Split('.')
  if($parts.Length -ne 3){throw 'Staging service identity unavailable'}
  $encoded=$parts[1].Replace('-','+').Replace('_','/')
  $encoded=$encoded.PadRight($encoded.Length+((4-$encoded.Length%4)%4),'=')
  $claims=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))|ConvertFrom-Json
  if($claims.ref -ne $ref -or $claims.role -ne 'service_role'){throw 'Staging credential scope mismatch'}
  # Actual authenticated provider read, not merely trusted JWT decoding.
  $user=& $Request 'GET' $uri $key $null
  if($user.id -ne $id -or $user.email -cne $email -or !$user.email_confirmed_at){throw 'Exact confirmed fixture not verified'}
  $first=& $ReadPrivate 'New password (private; minimum 16 characters)'
  $second=& $ReadPrivate 'Confirm new password (private)'
  if($first -isnot [Security.SecureString] -or $second -isnot [Security.SecureString]){throw 'Private secure input unavailable'}
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
  $ptr2=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
  $p=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  $q=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr2)
  if($p.Length -lt 16 -or ![string]::Equals($p,$q,[StringComparison]::Ordinal)){throw 'Passwords mismatch or too short; nothing changed'}
  $body=@{password=$p}|ConvertTo-Json -Compress
  $changed=& $Request 'PUT' $uri $key $body
  if($changed.id -ne $id -or $changed.email -cne $email){throw 'Reset response not verified; stop and review'}
  # Never return a user object, credential, token or request body.
  return $true
 } finally {
  if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
  if($ptr2 -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr2)}
  if($first -is [Security.SecureString]){$first.Dispose()}
  if($second -is [Security.SecureString]){$second.Dispose()}
  $key=$null;$p=$null;$q=$null;$body=$null
 }
}
if($MyInvocation.InvocationName -ne '.') {
 $client=$null
 try {
  Add-Type -AssemblyName System.Net.Http
  $handler=New-Object Net.Http.HttpClientHandler
  $handler.AllowAutoRedirect=$false
  $client=New-Object Net.Http.HttpClient($handler)
  $client.Timeout=[TimeSpan]::FromSeconds(30)
  $get={
   $raw=(& supabase projects api-keys --project-ref qxhhlprentrufobpcgna --output json 2>$null|Out-String)
   if($LASTEXITCODE -ne 0){throw 'Private staging CLI authorization unavailable'}
   $items=$raw|ConvertFrom-Json
   $selected=@($items|Where-Object name -eq 'service_role')
   if($selected.Count -ne 1 -or !$selected[0].api_key){throw 'Existing staging service identity unavailable'}
   $selected[0].api_key
  }
  $request={param($method,$uri,$key,$body)
   $r=New-Object Net.Http.HttpRequestMessage([Net.Http.HttpMethod]::new($method),$uri)
   $r.Headers.Add('apikey',$key)
   $r.Headers.Authorization=New-Object Net.Http.Headers.AuthenticationHeaderValue('Bearer',$key)
   if($null -ne $body){$r.Content=New-Object Net.Http.StringContent($body,[Text.Encoding]::UTF8,'application/json')}
   $response=$null
   try {
    $response=$client.SendAsync($r).GetAwaiter().GetResult()
    if(!$response.IsSuccessStatusCode){throw 'Provider request rejected; no automatic retry'}
    $text=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    return ($text|ConvertFrom-Json)
   }finally{if($response){$response.Dispose()};$r.Dispose()}
  }
  $ok=Invoke-BuyerMatchOwnerReset -GetKey $get -Request $request -ReadPrivate {param($label) Read-Host $label -AsSecureString}
  if($ok){Write-Host 'Exact S2 Pro password reset verified. No email sent. Sign in normally in the protected candidate Preview.'}
 }catch{
  # No raw provider exception, response, key, password or body can reach output.
  Write-Host 'STOP: private reset did not complete or could not be verified. No retry was attempted. Report only this status; never share a password or key.'
  exit 1
 }finally{if($client){$client.Dispose()}}
}
