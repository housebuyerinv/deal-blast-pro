param([string]$Node,[string]$Fixture,[string]$Corrected)
$ErrorActionPreference='Stop'
try {
 & $Node $Fixture 2>$null
 Write-Output 'LEGACY_COMPLETED'
} catch {
 Write-Output 'LEGACY_CAUGHT_NATIVE_STDERR'
}
if($Corrected){
 & $Node $Corrected
 if($LASTEXITCODE -ne 0){throw 'Corrected process fixture failed'}
}
