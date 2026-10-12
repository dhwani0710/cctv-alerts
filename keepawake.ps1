Add-Type -Name Win -Namespace Native -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
while ($true) {
  [Native.Win]::SetThreadExecutionState(0x80000003) | Out-Null
  Start-Sleep -Seconds 30
}