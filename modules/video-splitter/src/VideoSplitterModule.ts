import { NativeModule, requireNativeModule } from 'expo';

import type { SplitOptions, VideoInfo, VideoSplitterModuleEvents } from './VideoSplitter.types';

declare class VideoSplitterModule extends NativeModule<VideoSplitterModuleEvents> {
  getVideoInfo(uri: string): Promise<VideoInfo>;
  split(options: SplitOptions): Promise<string[]>;
}

export default requireNativeModule<VideoSplitterModule>('VideoSplitter');
