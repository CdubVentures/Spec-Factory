@echo off
cd /d "C:\Users\Chris\Desktop\Spec Factory"
start "" /min "C:\Program Files\nodejs\node.exe" src/api/guiServer.js --port 8788 --local
