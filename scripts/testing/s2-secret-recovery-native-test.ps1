# Actual Windows PowerShell5 public-file API test; NEVER reads the seed source.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 5) { throw 'Use pinned Windows PowerShell5' }
$code = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 's2-private-seed-source.ps1'))
$parseErrors = $null; $tokens = $null
$ast = [Management.Automation.Language.Parser]::ParseInput($code,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'Private helper PowerShell5 parsing failed' }
# Load ONLY the reviewed pure ACL function, not any private-reader top-level code.
# Synthetic in-memory descriptors below never modify filesystem permissions.
$functionAst = $ast.Find({ param($a) $a -is [Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -ceq 'Assert-Acl' }, $true)
if ($null -eq $functionAst) { throw 'ACL function missing' }
. ([scriptblock]::Create($functionAst.Extent.Text))
$actor = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$approved = @{ ownerApprovedCustodianSid=$actor }
$allowed = @($actor,'S-1-5-18','S-1-5-32-544')
function Synthetic-Acl([Security.AccessControl.FileSystemRights]$rights) {
  $acl=New-Object Security.AccessControl.DirectorySecurity
  $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier($actor)))
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')), $rights, 'Allow')))
  return $acl
}
$null=Assert-Acl (Synthetic-Acl ([Security.AccessControl.FileSystemRights]::ReadAndExecute)) $false
$denials=0
foreach ($test in @(@([Security.AccessControl.FileSystemRights]::ReadAndExecute,$true),@([Security.AccessControl.FileSystemRights]::WriteAttributes,$false),@([Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles,$false))) {
  try { $null=Assert-Acl (Synthetic-Acl $test[0]) $test[1] } catch { $denials++ }
}
if ($denials -ne 3) { throw 'Synthetic ACL denial regression failed' }
$nativeCode = [regex]::Match($code, "(?s)Add-Type -TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value
if ([string]::IsNullOrWhiteSpace($nativeCode)) { throw 'Native code not found' }
Add-Type -TypeDefinition $nativeCode
$directory = Join-Path (Get-Location) ('artifacts/buyermatch-1b/secret-recovery-native-check-' + [Guid]::NewGuid().ToString())
if (Test-Path -LiteralPath $directory) { throw 'Non-overwrite preflight failed' }
$null = New-Item -Type Directory -Path $directory
$path = Join-Path $directory 'public-synthetic.txt'
$stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
  $bytes = [Text.Encoding]::UTF8.GetBytes('SYNTHETIC PUBLIC CONTENT - NO PRIVATE VALUES')
  $stream.Write($bytes,0,$bytes.Length); $stream.Flush()
  $acl = $stream.GetAccessControl()
  $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  if ([string]::IsNullOrWhiteSpace($owner) -or $acl.Access.Count -lt 1) { throw 'Handle security API failed' }
  $info = New-Object S2SourceHandle+Info
  if (-not [S2SourceHandle]::GetFileInformationByHandle($stream.SafeFileHandle,[ref]$info) -or $info.Links -ne 1 -or $info.SizeLow -ne $bytes.Length) { throw 'Handle identity API failed' }
  $physical = New-Object Text.StringBuilder 32768
  if ([S2SourceHandle]::GetFinalPathNameByHandle($stream.SafeFileHandle,$physical,32768,0) -eq 0) { throw 'Physical path API failed' }
  $same = $physical.ToString().Substring(4) -ceq $path
  if (-not $same) { throw 'Public synthetic logical/physical path mismatch' }
  $locked = $false
  try { $other=[IO.File]::OpenRead($path); $other.Dispose() } catch [IO.IOException] { $locked=$true }
  if (-not $locked) { throw 'Exclusive handle sharing failed' }
  $trusted = New-Object Security.Principal.NTAccount('NT SERVICE','TrustedInstaller')
  if ($trusted.Translate([Security.Principal.SecurityIdentifier]).Value -cne 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464') { throw 'OS ancestor principal mismatch' }
  $result = @{ verified=$true; syntheticPublicFileOnly=$true; actualPowerShell5=$true; sourceStaticParsing=$true; syntheticAclCases=4; syntheticAclCasesPassed=4; handleOwnerAndDacl=$true; handleFileIdAndSingleLink=$true; finalPhysicalPathApi=$true; logicalPhysicalSame=$same; exclusiveHandle=$true; trustedInstallerSid=$true; actualSeedCustodyVerified=$false; actualSecretsRead=$false }
  [IO.File]::WriteAllText((Join-Path $directory 'result.json'),($result | ConvertTo-Json -Compress))
  $result | ConvertTo-Json -Compress
} finally { $stream.Dispose() }
