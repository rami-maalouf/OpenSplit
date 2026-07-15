import { Button, Column, Host, Picker, Row, Spacer, Text } from '@expo/ui';
import { Directory, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Asset as MediaAsset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { formatBytes, formatDuration, planEqualChunks } from '@/lib/split-plan';
import { usePalette, type Palette } from '@/lib/theme';
import VideoSplitter, { type SplitProgressEvent, type VideoInfo } from '@/modules/video-splitter';

const CHUNK_CHOICES = [
  { label: '15s', value: '15' },
  { label: '30s', value: '30' },
  { label: '60s · stories', value: '60' },
  { label: '90s', value: '90' },
];

type PickedVideo = {
  uri: string;
  info: VideoInfo;
};

type Status = 'idle' | 'splitting' | 'done';

type Feedback = {
  kind: 'success' | 'error';
  message: string;
};

function FeedbackBanner({ feedback, palette }: { feedback: Feedback; palette: Palette }) {
  const isSuccess = feedback.kind === 'success';
  const tint = isSuccess ? palette.success : palette.error;
  return (
    <View style={[styles.banner, { backgroundColor: `${tint}22`, borderColor: `${tint}55` }]}>
      <Host matchContents={{ vertical: true }} style={styles.host}>
        <Text textStyle={{ color: tint, fontWeight: '600' }}>
          {`${isSuccess ? '✓' : '✕'}  ${feedback.message}`}
        </Text>
      </Host>
    </View>
  );
}

export default function HomeScreen() {
  const palette = usePalette();
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [chunkChoice, setChunkChoice] = useState('60');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<SplitProgressEvent | null>(null);
  const [chunks, setChunks] = useState<string[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [savedAll, setSavedAll] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const player = useVideoPlayer(null);

  const muted = { fontSize: 14, color: palette.textMuted };

  useEffect(() => {
    const subscription = VideoSplitter.addListener('onSplitProgress', setProgress);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (previewUri) {
      player.replaceAsync(previewUri);
    }
  }, [previewUri, player]);

  const succeed = (message: string) => {
    setFeedback({ kind: 'success', message });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const fail = (message: string) => {
    setFeedback({ kind: 'error', message });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const chunkTarget = Number(chunkChoice);
  const plan = useMemo(
    () => (video ? planEqualChunks(video.info.duration, chunkTarget) : []),
    [video, chunkTarget]
  );

  const pickVideo = async () => {
    setFeedback(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    try {
      const uri = result.assets[0].uri;
      const info = await VideoSplitter.getVideoInfo(uri);
      setVideo({ uri, info });
      setChunks([]);
      setSavedAll(false);
      setStatus('idle');
      setPreviewUri(uri);
      Haptics.selectionAsync();
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  };

  const split = async () => {
    if (!video) {
      return;
    }
    setFeedback(null);
    setStatus('splitting');
    setProgress({ completedChunks: 0, totalChunks: plan.length, progress: 0 });
    try {
      const outputDir = new Directory(Paths.cache, `split-${Date.now()}`);
      outputDir.create({ intermediates: true });
      const uris = await VideoSplitter.split({
        uri: video.uri,
        ranges: plan,
        outputDir: outputDir.uri,
        baseName: 'opensplit',
      });
      setChunks(uris);
      setStatus('done');
      succeed(`Split into ${uris.length} chunks`);
    } catch (e) {
      setStatus('idle');
      fail(e instanceof Error ? e.message : String(e));
    }
  };

  const saveAll = async () => {
    setFeedback(null);
    const permission = await requestPermissionsAsync(true);
    if (!permission.granted) {
      fail('Photo library permission is required to save chunks.');
      return;
    }
    try {
      for (const uri of chunks) {
        await MediaAsset.create(uri);
      }
      setSavedAll(true);
      succeed(`Saved ${chunks.length} videos to Photos`);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  };

  const share = async (uri: string) => {
    try {
      await Sharing.shareAsync(uri, { mimeType: 'video/mp4', UTI: 'public.movie' });
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  };

  const infoLine = video
    ? `${formatDuration(video.info.duration)} · ${video.info.width}x${video.info.height} · ${formatBytes(video.info.fileSize)}`
    : '';
  const planLine =
    plan.length === 1
      ? 'Fits in a single chunk, nothing to split.'
      : video
        ? `${plan.length} equal chunks · ~${formatDuration(video.info.duration / Math.max(plan.length, 1))} each`
        : '';
  const progressFraction = progress?.progress ?? 0;
  const progressLine = progress
    ? progress.completedChunks === 0
      ? `Splitting chunk 1 of ${progress.totalChunks}…`
      : `${progress.completedChunks} of ${progress.totalChunks} chunks done`
    : 'Starting…';

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}>
      <Host matchContents={{ vertical: true }} style={styles.host} seedColor={palette.brand}>
        <Column spacing={16}>
          <Text textStyle={{ fontSize: 17, color: palette.text }}>
            Pick a video of any length and split it into equal chunks that fit anywhere.
          </Text>
          <Button
            variant={video ? 'outlined' : 'filled'}
            label={video ? 'Pick a different video' : 'Pick a video'}
            onPress={pickVideo}
          />
        </Column>
      </Host>

      {video && (
        <>
          <View style={[styles.playerBox, { borderColor: palette.card }]}>
            <VideoView player={player} style={styles.player} contentFit="contain" nativeControls />
          </View>

          <Host matchContents={{ vertical: true }} style={styles.host} seedColor={palette.brand}>
            <Column spacing={12}>
              <Text textStyle={muted}>{infoLine}</Text>
              <Row spacing={12} alignment="center">
                <Text textStyle={{ color: palette.text }}>Max chunk length</Text>
                <Spacer flexible />
                <Picker
                  selectedValue={chunkChoice}
                  onValueChange={value => {
                    Haptics.selectionAsync();
                    setChunkChoice(value);
                  }}>
                  {CHUNK_CHOICES.map(choice => (
                    <Picker.Item key={choice.value} label={choice.label} value={choice.value} />
                  ))}
                </Picker>
              </Row>
              <Text textStyle={muted}>{planLine}</Text>
            </Column>
          </Host>

          {/* action button in its own host: content overflow in a sibling host can
              never push it outside tappable bounds */}
          {status !== 'splitting' && plan.length >= 2 && (
            <Host matchContents={{ vertical: true }} style={styles.host} seedColor={palette.accent}>
              <Button
                variant="filled"
                label={status === 'done' ? 'Split again' : 'Split video'}
                onPress={split}
              />
            </Host>
          )}

          {status === 'splitting' && (
            <View style={styles.progressBlock}>
              <View style={[styles.progressTrack, { backgroundColor: palette.card }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: palette.accent, width: `${Math.max(progressFraction * 100, 4)}%` },
                  ]}
                />
              </View>
              <Host matchContents={{ vertical: true }} style={styles.host}>
                <Text textStyle={muted}>{progressLine}</Text>
              </Host>
            </View>
          )}

          {status === 'done' && chunks.length > 0 && (
            <Host matchContents={{ vertical: true }} style={styles.host} seedColor={palette.brand}>
              <Column spacing={12}>
                <Text textStyle={{ fontSize: 20, fontWeight: '600', color: palette.text }}>
                  Chunks
                </Text>
                {chunks.map((uri, index) => (
                  <Row key={uri} spacing={8} alignment="center">
                    <Text
                      textStyle={{
                        color: palette.text,
                      }}>{`${String(index + 1).padStart(2, '0')} of ${String(chunks.length).padStart(2, '0')}`}</Text>
                    <Spacer flexible />
                    <Button variant="text" label="Preview" onPress={() => setPreviewUri(uri)} />
                    <Button variant="outlined" label="Share" onPress={() => share(uri)} />
                  </Row>
                ))}
              </Column>
            </Host>
          )}

          {status === 'done' && chunks.length > 0 && (
            <Host matchContents={{ vertical: true }} style={styles.host} seedColor={palette.accent}>
              <Button
                variant="filled"
                label={savedAll ? 'Saved to Photos ✓' : 'Save all to Photos'}
                disabled={savedAll}
                onPress={saveAll}
              />
            </Host>
          )}
        </>
      )}

      {feedback && <FeedbackBanner feedback={feedback} palette={palette} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 20,
  },
  host: {
    width: '100%',
  },
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  playerBox: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  player: {
    width: '100%',
    aspectRatio: 16 / 10,
  },
  progressBlock: {
    gap: 10,
  },
  progressTrack: {
    borderRadius: 6,
    height: 10,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 6,
    height: '100%',
  },
});
