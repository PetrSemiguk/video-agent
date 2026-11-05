# Windows toast for Claude Code's Notification and Stop hooks. No extra modules: falls back to a
# tray balloon if the toast API is unavailable. Never blocks the session: all errors are swallowed.
$ErrorActionPreference = 'SilentlyContinue'
$MaxLength = 180
$BalloonMilliseconds = 6000

[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json

if ($payload.hook_event_name -eq 'Stop') {
    # Stop can fire again while a stop hook keeps the turn going; only the last one matters.
    if ($payload.stop_hook_active) { exit 0 }
    $title = 'Claude Code: finished'
    $text = $payload.last_assistant_message
} else {
    $title = if ($payload.title) { "Claude Code: $($payload.title)" } else { 'Claude Code' }
    $text = $payload.message
}
if (-not $text) { $text = 'The session needs a look.' }
$text = ($text -replace '\s+', ' ').Trim()
if ($text.Length -gt $MaxLength) { $text = $text.Substring(0, $MaxLength) + '...' }

try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    $escape = { param($value) [System.Security.SecurityElement]::Escape($value) }
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$(& $escape $title)</text><text>$(& $escape $text)</text></binding></visual></toast>")
    $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $balloon = New-Object System.Windows.Forms.NotifyIcon
    $balloon.Icon = [System.Drawing.SystemIcons]::Information
    $balloon.Visible = $true
    $balloon.ShowBalloonTip($BalloonMilliseconds, $title, $text, 'Info')
    Start-Sleep -Milliseconds $BalloonMilliseconds
    $balloon.Dispose()
}
exit 0
