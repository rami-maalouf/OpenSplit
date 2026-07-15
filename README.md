# OpenSplit

Split a video of any size and duration into equal chunks, natively, on iOS and Android.

Pick a video, choose a max chunk length (15/30/60/90 seconds), and OpenSplit cuts it into
equal parts - a 8:41 video at a 60s limit becomes 9 chunks of ~58s instead of eight full
chunks plus a 41-second stub. Chunks are numbered (`opensplit-01-of-09`) and can be
previewed, shared, or saved back to your photo library.

## How it works

- **UI**: [Expo Router](https://docs.expo.dev/router/introduction/) +
  [`@expo/ui`](https://docs.expo.dev/versions/latest/sdk/ui/) universal components -
  real SwiftUI on iOS, real Jetpack Compose on Android, one component tree.
- **Splitting**: a local [Expo Module](https://docs.expo.dev/modules/overview/) in
  [`modules/video-splitter`](modules/video-splitter):
  - **iOS**: `AVAssetExportSession` with the passthrough preset - samples are copied,
    never re-encoded. Fast and lossless, HDR survives untouched.
  - **Android**: [Media3 Transformer](https://developer.android.com/media/media3/transformer)
    with trim optimization - re-encodes only up to the first sync frame of each chunk,
    then copies compressed samples.
- **Media plumbing**: `expo-image-picker` (pick without transcoding via
  `preferredAssetRepresentationMode: current`), `expo-video` (preview), `expo-media-library`
  (save), `expo-sharing` (share sheet), `expo-file-system` (chunk workspace).

## Development

This app uses native modules and `@expo/ui`, so it runs in a development build (not Expo Go):

```sh
bun install
bunx expo prebuild
bunx expo run:ios      # or run:android
```

## Module API

```ts
import VideoSplitter from '@/modules/video-splitter';

const info = await VideoSplitter.getVideoInfo(uri);
// { duration, width, height, fileSize }

const uris = await VideoSplitter.split({
  uri,
  ranges: [{ start: 0, duration: 58 }, ...],
  outputDir,
  baseName: 'opensplit',
});
// emits onSplitProgress: { completedChunks, totalChunks, progress }
```
