import AVFoundation
import ExpoModulesCore

struct SplitRange: Record {
  @Field var start: Double = 0
  @Field var duration: Double = 0
}

struct SplitOptions: Record {
  @Field var uri: String = ""
  @Field var ranges: [SplitRange] = []
  @Field var outputDir: String = ""
  @Field var baseName: String = "chunk"
}

internal final class InvalidUriException: GenericException<String> {
  override var reason: String {
    "invalid or unreadable video uri: \(param)"
  }
}

internal final class ExportException: GenericException<String> {
  override var reason: String {
    "chunk export failed: \(param)"
  }
}

public class VideoSplitterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VideoSplitter")

    Events("onSplitProgress")

    AsyncFunction("getVideoInfo") { (uri: String) -> [String: Any] in
      guard let url = URL(string: uri), url.isFileURL else {
        throw InvalidUriException(uri)
      }
      let asset = AVURLAsset(url: url)
      let duration = try await asset.load(.duration)

      var width = 0.0
      var height = 0.0
      if let track = try await asset.loadTracks(withMediaType: .video).first {
        let size = try await track.load(.naturalSize)
        let transform = try await track.load(.preferredTransform)
        // apply rotation so callers get display dimensions
        let rect = CGRect(origin: .zero, size: size).applying(transform)
        width = abs(rect.width)
        height = abs(rect.height)
      }

      let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
      let fileSize = (attributes?[.size] as? NSNumber)?.int64Value ?? 0

      return [
        "duration": CMTimeGetSeconds(duration),
        "width": width,
        "height": height,
        "fileSize": fileSize,
      ]
    }

    AsyncFunction("split") { (options: SplitOptions) -> [String] in
      guard let url = URL(string: options.uri), url.isFileURL else {
        throw InvalidUriException(options.uri)
      }
      guard let outputDir = URL(string: options.outputDir), outputDir.isFileURL else {
        throw InvalidUriException(options.outputDir)
      }
      try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

      let asset = AVURLAsset(url: url)
      let total = options.ranges.count
      var outputs: [String] = []

      for (index, range) in options.ranges.enumerated() {
        let output = try await self.exportChunk(
          asset: asset,
          range: range,
          outputDir: outputDir,
          baseName: options.baseName,
          index: index,
          total: total
        )
        outputs.append(output.absoluteString)
        self.sendEvent("onSplitProgress", [
          "completedChunks": index + 1,
          "totalChunks": total,
          "progress": Double(index + 1) / Double(total),
        ])
      }

      return outputs
    }
  }

  private func exportChunk(
    asset: AVURLAsset,
    range: SplitRange,
    outputDir: URL,
    baseName: String,
    index: Int,
    total: Int
  ) async throws -> URL {
    // passthrough copies samples without re-encoding: fast and lossless
    guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
      throw ExportException("could not create export session")
    }

    // mp4 when the source codecs allow it, otherwise quicktime
    let fileType: AVFileType = session.supportedFileTypes.contains(.mp4) ? .mp4 : .mov
    let ext = fileType == .mp4 ? "mp4" : "mov"
    let name = String(format: "%@-%02d-of-%02d.%@", baseName, index + 1, total, ext)
    let outputURL = outputDir.appendingPathComponent(name)
    try? FileManager.default.removeItem(at: outputURL)

    session.outputURL = outputURL
    session.outputFileType = fileType
    session.timeRange = CMTimeRange(
      start: CMTime(seconds: range.start, preferredTimescale: 600),
      duration: CMTime(seconds: range.duration, preferredTimescale: 600)
    )

    await withCheckedContinuation { continuation in
      session.exportAsynchronously {
        continuation.resume()
      }
    }

    guard session.status == .completed else {
      throw ExportException(session.error?.localizedDescription ?? "unknown error")
    }
    return outputURL
  }
}
