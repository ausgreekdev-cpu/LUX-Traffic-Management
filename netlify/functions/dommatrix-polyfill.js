// Minimal DOMMatrix polyfill for pdfjs (pdf-parse) on serverless runtimes where
// @napi-rs/canvas is unavailable. pdfjs constructs `new DOMMatrix()` at module
// scope, which crashes with "DOMMatrix is not defined" without this shim.
// Implements the affine 2D matrix subset pdfjs relies on (a..f, translate,
// scale, multiply/pre-multiply, inverse). Must be imported before pdf-parse.

if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrix {
    constructor(init) {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      if (Array.isArray(init)) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      } else if (typeof init === 'string') {
        const m = init.match(/matrix\(([^)]+)\)/);
        if (m) {
          const v = m[1].split(/[\s,]+/).map(Number);
          [this.a, this.b, this.c, this.d, this.e, this.f] = v;
        }
      } else if (init && typeof init === 'object') {
        this.a = init.a ?? this.a; this.b = init.b ?? this.b;
        this.c = init.c ?? this.c; this.d = init.d ?? this.d;
        this.e = init.e ?? this.e; this.f = init.f ?? this.f;
      }
    }

    static _mul(x, y) {
      return new DOMMatrix([
        x.a * y.a + x.c * y.b,
        x.b * y.a + x.d * y.b,
        x.a * y.c + x.c * y.d,
        x.b * y.c + x.d * y.d,
        x.a * y.e + x.c * y.f + x.e,
        x.b * y.e + x.d * y.f + x.f
      ]);
    }

    multiply(other) { return DOMMatrix._mul(this, other); }
    preMultiplySelf(other) {
      const r = DOMMatrix._mul(other, this);
      Object.assign(this, r);
      return this;
    }
    postMultiplySelf(other) {
      const r = DOMMatrix._mul(this, other);
      Object.assign(this, r);
      return this;
    }
    translate(tx, ty = 0) { return DOMMatrix._mul(this, new DOMMatrix([1, 0, 0, 1, tx, ty])); }
    scale(sx, sy = sx) { return DOMMatrix._mul(this, new DOMMatrix([sx, 0, 0, sy, 0, 0])); }
    inverse() {
      const det = this.a * this.d - this.b * this.c;
      if (det === 0) return new DOMMatrix();
      return new DOMMatrix([
        this.d / det,
        -this.b / det,
        -this.c / det,
        this.a / det,
        (this.c * this.f - this.d * this.e) / det,
        (this.b * this.e - this.a * this.f) / det
      ]);
    }
    toJSON() { return { a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f }; }
  }
  globalThis.DOMMatrix = DOMMatrix;
}
