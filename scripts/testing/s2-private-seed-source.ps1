# PRIVATE CHILD ONLY. Never run interactively: returned seedText is private IPC.
# Default invocation performs no reads. This script has no provider/write/ACL API.
param([switch]$PrivateApprovedRead)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $PrivateApprovedRead) { [Console]::Out.WriteLine('{"status":"PREPARATION_ONLY"}'); exit 2 }
try {
  if (-not [Console]::IsInputRedirected -or -not [Console]::IsOutputRedirected -or -not [Console]::IsErrorRedirected) { throw 'STOP' }
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($request.actualOwnerApprovalVerified -ne $true -or $request.project -cne 'prj_XglHAvS3zjuyLWvHkuNt5U8BoUtl') { throw 'STOP' }
  foreach ($root in @('HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell','HKCU:\SOFTWARE\Policies\Microsoft\Windows\PowerShell')) {
    foreach ($policy in @(@('Transcription','EnableTranscripting'),@('ScriptBlockLogging','EnableScriptBlockLogging'),@('ModuleLogging','EnableModuleLogging'))) {
      $p = Join-Path $root $policy[0]
      if (Test-Path -LiteralPath $p) {
        $setting = Get-ItemProperty -LiteralPath $p -ErrorAction Stop
        $field = $setting.PSObject.Properties[$policy[1]]
        if ($null -ne $field -and $field.Value -eq 1) { throw 'STOP' }
      }
    }
  }
  $approved = $request.custody
  $logical = 'C:\Users\CTL Katastrophic\deal-blast-pro\.env.buyermatch-staging'
  if ($approved.ownerApprovedCustodianSid -notmatch '^S-1-5-21-[0-9-]+$' -or $request.ownerSid -notmatch '^S-1-5-21-[0-9-]+$' -or [string]::IsNullOrWhiteSpace($approved.physicalPath) -or $approved.size -lt 1 -or $approved.size -gt 32768) { throw 'STOP' }
  $allowed = @($approved.ownerApprovedCustodianSid, $request.ownerSid, 'S-1-5-18', 'S-1-5-32-544')
  $actor = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if (@($approved.ownerApprovedCustodianSid, $request.ownerSid) -notcontains $actor) { throw 'STOP' }
  function Assert-Access([string]$path, [bool]$isSource) {
    $acl = Get-Acl -LiteralPath $path -ErrorAction Stop
    return Assert-Acl $acl $isSource
  }
  function Assert-Acl($acl, [bool]$isSource) {
    $subjects = $allowed
    if (-not $isSource) { $subjects = @($allowed) + 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464' } # TrustedInstaller: existing OS ancestor owner only.
    $owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
    if (($isSource -and $owner -cne $approved.ownerApprovedCustodianSid) -or $subjects -notcontains $owner) { throw 'STOP' }
    foreach ($rule in $acl.Access) {
      if (-not $isSource -and (($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0)) { continue }
      if ($rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and [int64]$rule.FileSystemRights -ne 0) {
        $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
        # Public ancestor traversal/read is not access to a restricted leaf.
        # Deny any untrusted ancestor write/delete/ACL/ownership privilege.
        $danger = [int64]([Security.AccessControl.FileSystemRights]::WriteData -bor [Security.AccessControl.FileSystemRights]::WriteAttributes -bor [Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership)
        if ($subjects -notcontains $sid -and ($isSource -or (([int64]$rule.FileSystemRights -band $danger) -ne 0))) { throw 'STOP' }
      }
    }
    return $owner
  }
  # Only direct physical storage under the documented owner's repository is
  # eligible. A redirected packaged-app source needs separate custody review.
  if ($approved.physicalPath -cne $logical) { throw 'STOP' }
  $parent = [IO.Path]::GetDirectoryName($logical)
  while ($parent) {
    if (((Get-Item -Force -LiteralPath $parent).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'STOP' }
    $null = Assert-Access $parent $false
    $parent = [IO.Path]::GetDirectoryName($parent)
  }
  if (((Get-Item -Force -LiteralPath $logical).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'STOP' }
  $owner = Assert-Access $logical $true
  Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class S2SourceHandle {
  [StructLayout(LayoutKind.Sequential)] public struct Info {
    public uint Attr; public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
    public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern uint GetFinalPathNameByHandle(SafeFileHandle h, StringBuilder s, uint n, uint flags);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool GetFileInformationByHandle(SafeFileHandle h, out Info i);
}
'@
  $stream = [IO.File]::Open($logical, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
  try {
    # Owner/DACL are independently checked on THIS locked data handle. A prior
    # path ACL observation is insufficient to authorize the subsequent read.
    $owner = Assert-Acl ($stream.GetAccessControl()) $true
    $native = New-Object Text.StringBuilder 32768
    $length = [S2SourceHandle]::GetFinalPathNameByHandle($stream.SafeFileHandle, $native, 32768, 0)
    if ($length -eq 0 -or $length -ge 32768) { throw 'STOP' }
    $physical = $native.ToString()
    if ($physical.StartsWith('\\?\')) { $physical = $physical.Substring(4) }
    if ($physical -cne $approved.physicalPath -or $stream.Length -ne [int64]$approved.size) { throw 'STOP' }
    $before = New-Object S2SourceHandle+Info
    if (-not [S2SourceHandle]::GetFileInformationByHandle($stream.SafeFileHandle, [ref]$before) -or $before.Links -ne 1) { throw 'STOP' }
    $ticks = ([int64]$before.Written.dwHighDateTime -shl 32) -bor ([int64]$before.Written.dwLowDateTime -band 4294967295)
    $modified = [DateTime]::FromFileTimeUtc($ticks).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    if ($modified -cne $approved.modified) { throw 'STOP' }
    # No data read until all canonical, owner/ACL, link, size/time checks passed.
    $reader = New-Object IO.StreamReader($stream, (New-Object Text.UTF8Encoding($false, $true)), $false, 4096, $true)
    try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $after = New-Object S2SourceHandle+Info
    if (-not [S2SourceHandle]::GetFileInformationByHandle($stream.SafeFileHandle, [ref]$after) -or $after.IndexHigh -ne $before.IndexHigh -or $after.IndexLow -ne $before.IndexLow -or $after.Volume -ne $before.Volume -or $after.Written.dwLowDateTime -ne $before.Written.dwLowDateTime -or $after.Written.dwHighDateTime -ne $before.Written.dwHighDateTime) { throw 'STOP' }
    $null = Assert-Acl ($stream.GetAccessControl()) $true
    $nativeAfter = New-Object Text.StringBuilder 32768
    if ([S2SourceHandle]::GetFinalPathNameByHandle($stream.SafeFileHandle, $nativeAfter, 32768, 0) -ne $length -or $nativeAfter.ToString() -cne $native.ToString()) { throw 'STOP' }
    # Only the five permitted lines cross private IPC; unrelated passwords/keys
    # remain within this source worker and are never exported or installed.
    $selected = @($text -split '\r?\n' | Where-Object { $_ -cmatch '^(BUYERMATCH_IDENTITY_KEY|BM_RESPONSE_SECRET|BM_WORKER_SECRET|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' }) -join "`n"
    [Console]::Out.WriteLine((@{ seedText=$selected; custody=@{ ownerSid=$owner; physicalPath=$physical; logicalResolvesToPhysical=$true; sameFileId=$true; reparseFree=$true; hardLinkCount=1; restrictiveReadWriteAcl=$true; size=[int]$stream.Length; modified=$modified; handleStable=$true; directoryChainVerified=$true } } | ConvertTo-Json -Depth 4 -Compress))
  } finally { $stream.Dispose(); $text=$null }
} catch { [Console]::Out.WriteLine('{"status":"SOURCE_CUSTODY_OR_READ_UNVERIFIED"}'); exit 2 }
