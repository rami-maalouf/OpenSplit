import { Button, Column, Host, Picker, Row, Spacer, Text } from '@expo/ui';
import { Directory, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Asset as MediaAsset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { formatBytes, formatDuration, planEqualChunks } from '@/lib/split-plan';
import VideoSplitter, { type SplitProgressEvent, type VideoInfo } from '@/modules/video-splitter';

const CHUNK_CHOICES = [
  { label: '15s', value: '15' },
  { label: '30s', value: '30' },
  { label: '60s · stories', value: '60' },
  { label: '90s', value: '90' },
];

const MUTED = { fontSize: 14, color: '#8a8a8e' };
const ERROR_RED = '#c62828';

type PickedVideo = {
  uri: string;
  info: VideoInfo;
};

type Status = 'idle' | 'splitting' | 'done';

export default function HomeScreen() {
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [chunkChoice, setChunkChoice] = useState('60');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<SplitProgressEvent | null>(null);
  const [chunks, setChunks] = useState<string[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [savedAll, setSavedAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const player = useVideoPlayer(null);

  useEffect(() => {
    const subscription = VideoSplitter.addListener('onSplitProgress', setProgress);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (previewUri) {
      player.replaceAsync(previewUri);
    }
  }, [previewUri, player]);

  const chunkTarget = Number(chunkChoice);
  const plan = useMemo(
    () => (video ? planEqualChunks(video.info.duration, chunkTarget) : []),
    [video, chunkTarget]
  );

  const pickVideo = async () => {
    setError(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const split = async () => {
    if (!video) {
      return;
    }
    setError(null);
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
    } catch (e) {
      setStatus('idle');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveAll = async () => {
    setError(null);
    const permission = await requestPermissionsAsync(true);
    if (!permission.granted) {
      setError('photo library permission is required to save chunks');
      return;
    }
    try {
      for (const uri of chunks) {
        await MediaAsset.create(uri);
      }
      setSavedAll(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const share = async (uri: string) => {
    await Sharing.shareAsync(uri, { mimeType: 'video/mp4', UTI: 'public.movie' });
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
  const progressLine = progress
    ? `chunk ${progress.completedChunks} of ${progress.totalChunks} done`
    : 'starting…';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Host matchContents={{ vertical: true }} style={styles.host}>
        <Column spacing={16}>
          <Text textStyle={{ fontSize: 17 }}>
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
          <View style={styles.playerBox}>
            <VideoView player={player} style={styles.player} contentFit="contain" nativeControls />
          </View>

          <Host matchContents={{ vertical: true }} style={styles.host}>
            <Column spacing={12}>
              <Text textStyle={MUTED}>{infoLine}</Text>
              <Row spacing={12} alignment="center">
                <Text>Max chunk length</Text>
                <Spacer flexible />
                <Picker selectedValue={chunkChoice} onValueChange={setChunkChoice}>
                  {CHUNK_CHOICES.map(choice => (
                    <Picker.Item key={choice.value} label={choice.label} value={choice.value} />
                  ))}
                </Picker>
              </Row>
              <Text textStyle={MUTED}>{planLine}</Text>
            </Column>
          </Host>

          {/* action button in its own host: content overflow in a sibling host can
              never push it outside tappable bounds */}
          {status !== 'splitting' && plan.length >= 2 && (
            <Host matchContents={{ vertical: true }} style={styles.host}>
              <Button variant="filled" label="Split video" onPress={split} />
            </Host>
          )}

          {status === 'splitting' && (
            <View style={styles.progressRow}>
              <ActivityIndicator />
              <Host matchContents={{ vertical: true }} style={styles.host}>
                <Text textStyle={MUTED}>{progressLine}</Text>
              </Host>
            </View>
          )}

          {status === 'done' && chunks.length > 0 && (
            <Host matchContents={{ vertical: true }} style={styles.host}>
              <Column spacing={12}>
                <Text textStyle={{ fontSize: 20, fontWeight: '600' }}>Chunks</Text>
                {chunks.map((uri, index) => (
                  <Row key={uri} spacing={8} alignment="center">
                    <Text>{`${String(index + 1).padStart(2, '0')} of ${String(chunks.length).padStart(2, '0')}`}</Text>
                    <Spacer flexible />
                    <Button variant="text" label="Preview" onPress={() => setPreviewUri(uri)} />
                    <Button variant="outlined" label="Share" onPress={() => share(uri)} />
                  </Row>
                ))}
              </Column>
            </Host>
          )}

          {status === 'done' && chunks.length > 0 && (
            <Host matchContents={{ vertical: true }} style={styles.host}>
              <Button
                variant="filled"
                label={savedAll ? 'Saved to Photos' : 'Save all to Photos'}
                disabled={savedAll}
                onPress={saveAll}
              />
            </Host>
          )}
        </>
      )}

      {error && (
        <Host matchContents={{ vertical: true }} style={styles.host}>
          <Text textStyle={{ color: ERROR_RED }}>{error}</Text>
        </Host>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  host: {
    width: '100%',
  },
  content: {
    padding: 16,
    gap: 20,
  },
  playerBox: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  player: {
    width: '100%',
    aspectRatio: 16 / 10,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
