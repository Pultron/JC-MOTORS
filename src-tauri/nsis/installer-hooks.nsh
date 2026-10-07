; Repoint existing Start Menu and Desktop shortcuts to a uniquely named icon.
; The new resource path invalidates stale Windows icon cache entries on upgrade.
!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\jc-motors-logo-v2.ico" 0
  !if "${STARTMENUFOLDER}" != ""
    CreateShortCut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\jc-motors-logo-v2.ico" 0
  !else
    CreateShortCut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\jc-motors-logo-v2.ico" 0
  !endif
!macroend
