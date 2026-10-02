Option Explicit
Dim shell, fso, projectRoot, scriptPath, command, result
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projectRoot = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = fso.BuildPath(projectRoot, "scripts\Launch-LifeOS.ps1")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & scriptPath & """"
result = shell.Run(command, 0, True)
If result <> 0 Then
  MsgBox "LifeOS could not start. See the latest launcher log in %LOCALAPPDATA%\LifeOS\logs.", vbExclamation, "LifeOS"
End If
