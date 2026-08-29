# Smart PDF Editor

Smart PDF Editor is a browser-only PDF editing web application that runs entirely in the user's browser. It uses PDF.js to render PDF pages, Fabric.js to provide an editing overlay (text, drawing, images, signature), and pdf-lib to export a new edited PDF. All processing is local — no files are uploaded to any server.

This project is designed to be hosted for free on GitHub Pages.

---

## Files

- index.html
- style.css
- app.js
- README.md

---

## How to deploy on GitHub Pages

1. Create a new repository on GitHub (e.g., `smart-pdf-editor`).
2. Upload the files (`index.html`, `style.css`, `app.js`, `README.md`) to the repository root.
3. On GitHub, go to Settings -> Pages (or `Settings -> Pages` in the repository).
4. Under "Build and deployment", set "Branch" to `main` (or your default branch) and folder to `/ (root)`.
5. Save; GitHub Page URL will be shown (e.g., `https://<username>.github.io/smart-pdf-editor/`).
6. Open that URL. The app should load and run fully in the browser.

---

## How the editor works

- Open a PDF using the "Open PDF" button or by dragging and dropping a PDF onto the left drop zone.
- Thumbnails of pages are shown on the left. Click a thumbnail to select a page.
- The main view shows the page and an editable overlay controlled by Fabric.js.
- Use the toolbar:
  - Select: choose and move objects.
  - Text: click or double-click on page to add a text box; double-click a textbox to edit its content.
  - Edit Text: when a text object is active, editing is possible by double-clicking.
  - Eraser: click an object to delete it.
  - Image: upload JPG/PNG/WEBP and place it.
  - Draw: freehand drawing.
  - Highlight: semi-transparent yellow drawing.
  - Signature: use draw tool as thicker stroke for signatures (or upload an image).
  - Zoom: choose Fit, 50%, 75%, 100%, etc.
  - Undo / Redo: undo/redo per page.
  - Add/Delete/Duplicate/Rotate page buttons are on the left.
  - Find & Replace: finds overlay text objects on the currently visible page (useful for text added via overlay).

- When you're done, click "Download PDF" (or Save). The app rasterizes each page together with overlays and produces a new PDF for download using pdf-lib. This ensures the edits are preserved exactly as seen.

---

## Libraries used

- PDF.js (mozilla/pdf.js) — rendering PDF pages in the browser.
- Fabric.js — powerful canvas object model; used for text, images, drawing overlays.
- pdf-lib — create and compose the final downloadable PDF.
- Google Fonts: Noto Sans Devanagari, Noto Serif Devanagari included via Google Fonts for Devanagari/Marathi support.

All libraries are loaded via public CDNs to allow the project to be run on static hosting like GitHub Pages.

---

## Marathi / Devanagari support

To type Marathi or Hindi (Devanagari), select a font from the font dropdown that supports Devanagari (e.g., "Noto Sans Devanagari" or "Noto Serif Devanagari") and type in a browser input that supports Marathi keyboard input. Your system's or browser's input method (IME) will handle Marathi composition. The editor uses Unicode fonts, so Devanagari characters will be rendered correctly.

Example text you can paste/type:
"माझी सैनिक शिक्षण प्रसारक मंडळ संचलित"

---

## Text replacement and overlays

Embedded PDF text cannot always be modified directly in-place (due to embedded fonts or PDFs that are scanned images). This application implements a reliable overlay approach:

1. The original PDF page is rendered visually (unchanged).
2. User selects or adds overlay text boxes and positions them over existing text.
3. To "delete" existing text, you can draw a filled rectangle (or use a background-colored textbox) over the original text and then add replacement text on top.
4. On export, the app renders the original page and all overlays to a flattened image and packs that image into the new PDF. The exported PDF preserves the visual page size and orientation.

Note: Because overlays are raster-composited onto pages for export, the final PDF pages are raster images (preserving appearance). For many workflows this is acceptable and avoids font embedding complexities.

---

## Known limitations & error handling

- Password-protected PDFs: the demo does not support unlocking password-protected PDFs.
- Very large PDFs: exporting huge documents or very large page images may be slow or memory-heavy in the browser. The app will try to use reasonable export scaling, but extremely large files may fail.
- The find/replace currently targets overlay text objects (text that you added in the editor). It cannot modify embedded PDF text directly.
- Export uses rasterization for overlays; vector editing of embedded PDF text is not implemented.
- If PDF loading or export fails, the app shows clear messages in the footer error area; check browser console for details.

---

## Tips

- Use the font dropdown to pick Devanagari fonts for Marathi/Hindi content.
- Double-click text boxes to edit; press ESC or click away to finish editing.
- For signatures, use the signature tool to draw or upload an image file.
- All operations are local — the browser never uploads the PDF to any external server.

---

If you still see an error when running the app:
1. Open the browser developer console (F12) and share any errors you see.
2. Confirm you placed `index.html`, `style.css`, and `app.js` in the repository root.
3. Confirm external CDNs are reachable (your environment may block them).

If you tell me the exact error message shown in the console or the behavior (blank screen / buttons not working / "pdf.js not defined" etc.), I will provide a targeted fix immediately.