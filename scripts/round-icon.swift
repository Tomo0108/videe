// Legacy ICNS/ICO do not carry an Icon Composer mask. Apply one at export time.
// Keep the opaque iOS and Apple touch artwork untouched: those are masked by the OS.
import AppKit
let source = CommandLine.arguments[1]
let destination = CommandLine.arguments[2]
let size = 1024
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
let context = NSGraphicsContext(bitmapImageRep: bitmap)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.imageInterpolation = .high
let bounds = NSRect(x: 32, y: 32, width: 960, height: 960)
NSBezierPath(roundedRect: bounds, xRadius: 210, yRadius: 210).addClip()
NSImage(contentsOfFile: source)!.draw(in: bounds, from: .zero, operation: .copy, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
// Fail generation if alpha masking regresses.
precondition(bitmap.colorAt(x: 0, y: 0)!.alphaComponent == 0)
precondition(bitmap.colorAt(x: 512, y: 512)!.alphaComponent == 1)
precondition(bitmap.colorAt(x: 32, y: 32)!.alphaComponent == 0)
precondition(bitmap.colorAt(x: 512, y: 40)!.alphaComponent == 1)
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: destination))
