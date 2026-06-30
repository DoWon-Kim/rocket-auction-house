' Rocket Auction House — 서버 관리자 실행
' 더블클릭 시 서버 매니저를 백그라운드로 구동하고 브라우저로 UI를 엽니다.

Dim scriptDir, shell, fso, nodePath, managerJs, ret

scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
managerJs  = scriptDir & "server-manager.js"

Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")

' ── node.exe 탐색 (PATH → 일반 설치 경로 순) ──────────────────────────────
nodePath = ""
Dim candidates(4)
candidates(0) = "node"
candidates(1) = "C:\Program Files\nodejs\node.exe"
candidates(2) = "C:\Program Files (x86)\nodejs\node.exe"
candidates(3) = shell.ExpandEnvironmentStrings("%APPDATA%\nvm\current\node.exe")
candidates(4) = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%\fnm\node.exe")

Dim i
For i = 0 To 4
  If candidates(i) = "node" Then
    ' PATH에서 찾기 — 버전 출력 성공 여부로 판단
    ret = shell.Run("cmd /c node --version >nul 2>&1", 0, True)
    If ret = 0 Then nodePath = "node" : Exit For
  ElseIf fso.FileExists(candidates(i)) Then
    nodePath = """" & candidates(i) & """"
    Exit For
  End If
Next

If nodePath = "" Then
  MsgBox "Node.js를 찾을 수 없습니다." & vbCrLf & vbCrLf & _
    "https://nodejs.org 에서 설치 후 다시 시도하세요.", _
    vbExclamation, "Rocket Auction House"
  WScript.Quit 1
End If

' ── 이미 서버가 실행 중인지 확인 ──────────────────────────────────────────
ret = shell.Run("cmd /c netstat -ano | findstr :3900 >nul 2>&1", 0, True)
If ret = 0 Then
  ' 이미 실행 중 → 브라우저만 열기
  shell.Run "http://localhost:3900", 1, False
  WScript.Quit 0
End If

' ── 서버 매니저 시작 ───────────────────────────────────────────────────────
shell.Run nodePath & " """ & managerJs & """", 0, False

' ── 서버가 올라올 때까지 대기 (최대 10초) ─────────────────────────────────
Dim waited, ready
waited = 0
ready  = False
Do While waited < 10000
  WScript.Sleep 600
  waited = waited + 600
  ret = shell.Run("cmd /c netstat -ano | findstr :3900 >nul 2>&1", 0, True)
  If ret = 0 Then ready = True : Exit Do
Loop

If ready Then
  shell.Run "http://localhost:3900", 1, False
Else
  MsgBox "서버 매니저가 10초 내에 시작되지 않았습니다." & vbCrLf & vbCrLf & _
    "수동으로 브라우저에서 http://localhost:3900 을 열거나," & vbCrLf & _
    "manager\server-manager.js 를 직접 실행해보세요.", _
    vbExclamation, "Rocket Auction House"
End If
