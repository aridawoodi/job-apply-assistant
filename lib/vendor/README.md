# Vendored libraries (bundled, no CDN, no remote code)

| File | Library | Version | License |
|---|---|---|---|
| `pdf.min.js`, `pdf.worker.min.js` | [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 3.11.174 | Apache-2.0 (`LICENSE-pdfjs.txt`) |
| `jszip.min.js` | [JSZip](https://github.com/Stuk/jszip) | 3.10.2 | MIT or GPLv3, used under MIT (`LICENSE-jszip.md`) |
| `jspdf.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF) | 4.2.1 | MIT (`LICENSE-jspdf.txt`) |

These are unmodified copies from npm with one exception. In `jspdf.umd.min.js`, the URL of the optional
`pdfobject` viewer script on cdnjs (used only by `output('pdfobjectnewwindow')`, which this extension never
calls) was replaced with an empty string. The bundle therefore contains no reference to remotely hosted code.
pdf.js runs with `isEvalSupported: false`.
