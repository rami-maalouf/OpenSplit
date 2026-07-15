import { NativeModule, registerWebModule } from 'expo';

import type { SplitOptions, VideoInfo, VideoSplitterModuleEvents } from './VideoSplitter.types';

class VideoSplitterModule extends NativeModule<VideoSplitterModuleEvents> {
  getVideoInfo(_uri: string): Promise<VideoInfo> {
    return Promise.reject(new Error('VideoSplitter is not available on web'));
  }
  split(_options: SplitOptions): Promise<string[]> {
    return Promise.reject(new Error('VideoSplitter is not available on web'));
  }
}

export default registerWebModule(VideoSplitterModule, 'VideoSplitterModule');
