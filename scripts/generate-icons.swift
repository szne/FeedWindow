import AppKit
import Foundation
let directory = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
for size in [16, 32, 48, 128, 256, 512, 1024] {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    let s = CGFloat(size)
    NSColor(calibratedRed: 0.14, green: 0.35, blue: 0.26, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: s, height: s), xRadius: s * 0.23, yRadius: s * 0.23).fill()
    NSColor(calibratedRed: 0.92, green: 0.96, blue: 0.86, alpha: 1).setStroke()
    let ring = NSBezierPath(ovalIn: NSRect(x: s * 0.22, y: s * 0.26, width: s * 0.56, height: s * 0.56))
    ring.lineWidth = max(1, s * 0.055)
    ring.stroke()
    let hands = NSBezierPath()
    hands.move(to: NSPoint(x: s * 0.5, y: s * 0.71))
    hands.line(to: NSPoint(x: s * 0.5, y: s * 0.54))
    hands.line(to: NSPoint(x: s * 0.63, y: s * 0.46))
    hands.lineWidth = max(1, s * 0.05)
    hands.lineCapStyle = .round
    hands.lineJoinStyle = .round
    hands.stroke()
    NSColor(calibratedRed: 0.76, green: 0.86, blue: 0.6, alpha: 1).setFill()
    for x in [0.34, 0.47, 0.60] {
        NSBezierPath(roundedRect: NSRect(x: s * x, y: s * 0.135, width: s * 0.07, height: s * 0.04), xRadius: s * 0.02, yRadius: s * 0.02).fill()
    }
    image.unlockFocus()
    let data = NSBitmapImageRep(data: image.tiffRepresentation!)!.representation(using: .png, properties: [:])!
    try data.write(to: directory.appendingPathComponent("icon-\(size).png"))
}
