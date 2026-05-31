Set objFSO = CreateObject("Scripting.FileSystemObject")
strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
strParentPath = objFSO.GetParentFolderName(strScriptPath)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = strParentPath
WshShell.Run "cmd.exe /c npm start", 0, false
