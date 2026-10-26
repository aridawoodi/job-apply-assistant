# Windows notes

AI Job Application Assistant runs the same on Windows 10/11 as on macOS. Nothing in it depends on the operating
system except the setup page's download link and the manual fallback steps.

**Install Ollama.** The setup page offers `OllamaSetup.exe` from ollama.com. Run it and click *Install*.
Ollama starts by itself and shows a llama icon in the taskbar tray (bottom right; click the ^ arrow if
it's hidden). It also starts when Windows starts.

**Connection.** The extension connects to `http://127.0.0.1:11434` and removes the `Origin` header on its
own requests, so you don't need to set `OLLAMA_ORIGINS`. If the setup page still says Ollama "refused the
connection" after *Try the automatic fix*, use the one-time manual fallback:
1. Press the Windows key, type **environment variables**, open **Edit environment variables for your account**.
2. **New…** → Name `OLLAMA_ORIGINS`, Value `chrome-extension://*` → OK, OK.
3. Right-click the llama in the tray → **Quit Ollama**, then start Ollama again from the Start menu.

**Firewall.** Ollama only listens on your own computer (127.0.0.1). If Windows Defender Firewall asks
about Ollama, "Private networks" is enough; the extension never needs network access to other machines.

**Memory.** The setup page reads your memory size and recommends `qwen2.5:3b` (8 GB) or `qwen2.5:7b`
(16 GB or more). On laptops with 8 GB, close other heavy apps while the AI answers.

**Files.** Downloads go to your normal Downloads folder. File names are made Windows-safe (no
`\ / : * ? " < > |`). Word files open in Microsoft Word, LibreOffice or Google Docs.

**Shortcuts.** In Settings, **Ctrl+S** saves (⌘S on Mac). The chat sends with **Enter**; **Shift+Enter**
adds a line.

**Edge.** Microsoft Edge can install from the Chrome Web Store (allow extensions from other stores when
asked). Everything works the same.

**Install from source (developers).** Use `chrome://extensions` → Developer mode → Load unpacked. Paths
with spaces are fine. The test scripts in `dev-tests/` were written for Linux/macOS shells; under
Windows run them from Git Bash or WSL (LibreOffice is only needed for the render checks).
