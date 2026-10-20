/**
 * minipdf.js — Minimal single-page PDF generator with embedded JPEG image.
 * No dependencies. Exposes: window.MiniPDF.fromCanvas(canvas) → Blob
 */
(function (global) {
  'use strict';

  /**
   * Build a minimal valid PDF that contains a single full-page JPEG image.
   * @param {HTMLCanvasElement} canvas
   * @param {number} [quality=0.92]  JPEG quality
   * @returns {Promise<Blob>}  PDF blob, ready to save
   */
  function fromCanvas(canvas, quality = 0.92) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        try {
          const ab = await blob.arrayBuffer();
          const jpegBytes = new Uint8Array(ab);
          const pdfBlob = buildPDF(jpegBytes, canvas.width, canvas.height);
          resolve(pdfBlob);
        } catch (e) { reject(e); }
      }, 'image/jpeg', quality);
    });
  }

  /** Low-level PDF builder */
  function buildPDF(jpegBytes, imgW, imgH) {
    // Page dimensions in PDF user-units (points, 72 pt/inch).
    // We treat each CSS pixel as 1 pt — this keeps the image 1:1 on screen.
    // For very tall pages the PDF will just be very tall (no clipping).
    const pageW = imgW;
    const pageH = imgH;

    const enc   = new TextEncoder();
    const parts = [];          // Uint8Array chunks
    const offsets = [];        // byte offsets of each object

    let pos = 0;               // running byte position

    function push(str) {
      const chunk = enc.encode(str);
      parts.push(chunk);
      pos += chunk.length;
    }
    function pushBytes(bytes) {
      parts.push(bytes);
      pos += bytes.length;
    }
    function objStart(n) {
      offsets[n] = pos;
      push(`${n} 0 obj\n`);
    }
    function objEnd() {
      push('endobj\n');
    }

    // ── Header ────────────────────────────────────────────────────────────────
    push('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

    // ── Object 1: Catalog ─────────────────────────────────────────────────────
    objStart(1);
    push('<< /Type /Catalog /Pages 2 0 R >>\n');
    objEnd();

    // ── Object 2: Pages ───────────────────────────────────────────────────────
    objStart(2);
    push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n');
    objEnd();

    // ── Object 3: Page ────────────────────────────────────────────────────────
    objStart(3);
    push(
      `<< /Type /Page\n` +
      `   /Parent 2 0 R\n` +
      `   /MediaBox [0 0 ${pageW} ${pageH}]\n` +
      `   /Resources << /XObject << /Im1 4 0 R >> >>\n` +
      `   /Contents 5 0 R\n` +
      `>>\n`
    );
    objEnd();

    // ── Object 4: Image XObject ───────────────────────────────────────────────
    objStart(4);
    push(
      `<< /Type /XObject\n` +
      `   /Subtype /Image\n` +
      `   /Width ${imgW}\n` +
      `   /Height ${imgH}\n` +
      `   /ColorSpace /DeviceRGB\n` +
      `   /BitsPerComponent 8\n` +
      `   /Filter /DCTDecode\n` +
      `   /Length ${jpegBytes.length}\n` +
      `>>\n` +
      `stream\n`
    );
    pushBytes(jpegBytes);
    push('\nendstream\n');
    objEnd();

    // ── Object 5: Content stream — draws image to fill entire page ────────────
    // PDF coordinate system: origin at bottom-left, y-axis up.
    // "q <w> 0 0 <h> 0 0 cm /Im1 Do Q" scales image to fill page.
    const contentStr = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im1 Do\nQ\n`;
    objStart(5);
    push(
      `<< /Length ${contentStr.length} >>\n` +
      `stream\n` +
      contentStr +
      `endstream\n`
    );
    objEnd();

    // ── Cross-reference table ─────────────────────────────────────────────────
    const xrefPos = pos;
    const numObjs = offsets.length; // indices 1..5 used
    push(`xref\n0 ${numObjs + 1}\n`);
    push('0000000000 65535 f \n');
    for (let i = 1; i <= numObjs; i++) {
      const off = (offsets[i] ?? 0).toString().padStart(10, '0');
      push(`${off} 00000 n \n`);
    }

    // ── Trailer ───────────────────────────────────────────────────────────────
    push(
      `trailer\n` +
      `<< /Size ${numObjs + 1} /Root 1 0 R >>\n` +
      `startxref\n${xrefPos}\n` +
      `%%EOF\n`
    );

    // ── Assemble ──────────────────────────────────────────────────────────────
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out   = new Uint8Array(total);
    let offset  = 0;
    for (const p of parts) { out.set(p, offset); offset += p.length; }

    return new Blob([out], { type: 'application/pdf' });
  }

  global.MiniPDF = { fromCanvas };
})(window);
