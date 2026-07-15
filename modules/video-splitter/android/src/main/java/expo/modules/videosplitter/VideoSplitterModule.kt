package expo.modules.videosplitter

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File

class SplitRange : Record {
  @Field val start: Double = 0.0
  @Field val duration: Double = 0.0
}

class SplitOptions : Record {
  @Field val uri: String = ""
  @Field val ranges: List<SplitRange> = emptyList()
  @Field val outputDir: String = ""
  @Field val baseName: String = "chunk"
}

class InvalidUriException(uri: String) :
  CodedException("invalid or unreadable video uri: $uri")

class SplitFailedException(message: String) :
  CodedException("chunk export failed: $message")

class VideoSplitterModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("react context lost")

  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("VideoSplitter")

    Events("onSplitProgress")

    AsyncFunction("getVideoInfo") { uri: String ->
      val retriever = MediaMetadataRetriever()
      try {
        retriever.setDataSource(context, Uri.parse(uri))
        val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
          ?: throw InvalidUriException(uri)
        var width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
        var height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
        val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        if (rotation == 90 || rotation == 270) {
          val tmp = width
          width = height
          height = tmp
        }
        mapOf(
          "duration" to durationMs / 1000.0,
          "width" to width,
          "height" to height,
          "fileSize" to fileSize(uri)
        )
      } finally {
        retriever.release()
      }
    }

    AsyncFunction("split") { options: SplitOptions, promise: Promise ->
      val outputDir = File(Uri.parse(options.outputDir).path ?: throw InvalidUriException(options.outputDir))
      outputDir.mkdirs()
      // transformer must be driven from the main looper
      mainHandler.post {
        exportChunk(options, outputDir, 0, mutableListOf(), promise)
      }
    }
  }

  @OptIn(UnstableApi::class)
  private fun exportChunk(
    options: SplitOptions,
    outputDir: File,
    index: Int,
    outputs: MutableList<String>,
    promise: Promise
  ) {
    val total = options.ranges.size
    if (index >= total) {
      promise.resolve(outputs.toList())
      return
    }

    val range = options.ranges[index]
    val name = String.format("%s-%02d-of-%02d.mp4", options.baseName, index + 1, total)
    val outputFile = File(outputDir, name)
    if (outputFile.exists()) {
      outputFile.delete()
    }

    val mediaItem = MediaItem.Builder()
      .setUri(Uri.parse(options.uri))
      .setClippingConfiguration(
        MediaItem.ClippingConfiguration.Builder()
          .setStartPositionMs((range.start * 1000).toLong())
          .setEndPositionMs(((range.start + range.duration) * 1000).toLong())
          .build()
      )
      .build()

    val transformer = Transformer.Builder(context)
      // re-encode only up to the first sync frame, then copy samples losslessly
      .experimentalSetTrimOptimizationEnabled(true)
      .addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, exportResult: ExportResult) {
          outputs.add(Uri.fromFile(outputFile).toString())
          sendEvent(
            "onSplitProgress",
            mapOf(
              "completedChunks" to index + 1,
              "totalChunks" to total,
              "progress" to (index + 1).toDouble() / total
            )
          )
          exportChunk(options, outputDir, index + 1, outputs, promise)
        }

        override fun onError(
          composition: Composition,
          exportResult: ExportResult,
          exportException: ExportException
        ) {
          promise.reject(SplitFailedException(exportException.message ?: "unknown error"))
        }
      })
      .build()

    transformer.start(EditedMediaItem.Builder(mediaItem).build(), outputFile.absolutePath)
  }

  private fun fileSize(uri: String): Long {
    val parsed = Uri.parse(uri)
    return when (parsed.scheme) {
      "file" -> parsed.path?.let { File(it).length() } ?: 0L
      "content" ->
        context.contentResolver.openFileDescriptor(parsed, "r")?.use { it.statSize } ?: 0L
      else -> 0L
    }
  }
}
