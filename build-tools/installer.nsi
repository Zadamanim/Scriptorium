; Scriptorium installer — per-user, no admin rights needed.
; Built with the native Linux makensis (see build-tools/build-installer.sh).
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user

!define APPNAME "Scriptorium"
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPNAME}" "InstallDir"
BrandingText "${APPNAME} ${VERSION}"

!include "MUI2.nsh"
!include "FileFunc.nsh"
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to the Scriptorium"
!define MUI_WELCOMEPAGE_TEXT "A candle-lit desk for the writing of books.$\r$\n$\r$\nThis will set the Scriptorium up for you. Nothing else needs installing.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPNAME}.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Light the candle (start Scriptorium)"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright (C) 2026 Zadamanim (GPL-3.0-or-later)"

Var OldKey
Var OldIdx
Var OldName
Var OldCmd
Var OldDir

Section "Install"
  ; close a running copy so its files can be replaced
  nsExec::Exec 'taskkill /IM "${APPNAME}.exe" /F'
  Sleep 400

  ; Scriptorium 0.1.0 was installed by a different tool and registered under another
  ; name. Quietly run its own uninstaller so only one Scriptorium is ever listed.
  ; (Neither uninstaller touches the Library in Documents, nor the settings.)
  StrCpy $OldIdx 0
  old_loop:
    EnumRegKey $OldKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $OldIdx
    StrCmp $OldKey "" old_done
    IntOp $OldIdx $OldIdx + 1
    StrCmp $OldKey "${APPNAME}" old_loop
    ReadRegStr $OldName HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$OldKey" "DisplayName"
    StrCpy $OldName $OldName 11
    StrCmp $OldName "${APPNAME}" 0 old_loop
    ReadRegStr $OldCmd HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$OldKey" "QuietUninstallString"
    StrCmp $OldCmd "" 0 +3
      ReadRegStr $OldCmd HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$OldKey" "UninstallString"
      StrCpy $OldCmd "$OldCmd /S"
    ReadRegStr $OldDir HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$OldKey" "InstallLocation"
    DetailPrint "Removing an older Scriptorium ($OldKey)…"
    StrCmp $OldDir "" +3
      ExecWait '$OldCmd _?=$OldDir'
      Goto +2
      ExecWait '$OldCmd'
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$OldKey"
    IntOp $OldIdx $OldIdx - 1
    Goto old_loop
  old_done:

  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\resources"
  File /r "${SRCDIR}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall ${APPNAME}.exe"

  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe"
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe"

  ; .tome files open in Scriptorium
  WriteRegStr HKCU "Software\Classes\.tome" "" "Scriptorium.Tome"
  WriteRegStr HKCU "Software\Classes\Scriptorium.Tome" "" "Scriptorium Tome"
  WriteRegStr HKCU "Software\Classes\Scriptorium.Tome\DefaultIcon" "" "$INSTDIR\${APPNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\Scriptorium.Tome\shell\open\command" "" '"$INSTDIR\${APPNAME}.exe" "%1"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'

  ; Add/Remove Programs entry
  WriteRegStr HKCU "Software\${APPNAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Zadamanim"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${APPNAME}.exe,0"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall ${APPNAME}.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" "$0"
SectionEnd

; updates run silently with /RELAUNCH, so light the candle again when done
Function .onInstSuccess
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/RELAUNCH" $R1
  IfErrors +2
    Exec '"$INSTDIR\${APPNAME}.exe"'
FunctionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${APPNAME}.exe" /F'
  Sleep 400
  ; the Library (thy books) lives in Documents and is never touched
  RMDir /r "$INSTDIR"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"
  DeleteRegKey HKCU "Software\Classes\Scriptorium.Tome"
  ReadRegStr $0 HKCU "Software\Classes\.tome" ""
  StrCmp $0 "Scriptorium.Tome" 0 +2
    DeleteRegKey HKCU "Software\Classes\.tome"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\${APPNAME}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd
