// Minimal Path2D stand-in so geometry code can run under Node.
class FakePath2D {
  moveTo() {}
  lineTo() {}
  closePath() {}
  rect() {}
  arc() {}
}
(globalThis as unknown as { Path2D: unknown }).Path2D ??= FakePath2D;
