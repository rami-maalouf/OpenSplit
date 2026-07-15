export type VideoInfo = {
  /** duration in seconds */
  duration: number;
  /** display width in pixels (rotation applied) */
  width: number;
  /** display height in pixels (rotation applied) */
  height: number;
  /** file size in bytes */
  fileSize: number;
};

export type SplitRange = {
  /** start offset in seconds */
  start: number;
  /** chunk duration in seconds */
  duration: number;
};

export type SplitOptions = {
  /** source video uri (file:// or content://) */
  uri: string;
  /** ranges to cut, in order */
  ranges: SplitRange[];
  /** file:// directory the chunks are written into */
  outputDir: string;
  /** base file name, chunks become <baseName>-01-of-09.<ext> */
  baseName?: string;
};

export type SplitProgressEvent = {
  completedChunks: number;
  totalChunks: number;
  /** overall progress 0..1 */
  progress: number;
};

export type VideoSplitterModuleEvents = {
  onSplitProgress: (event: SplitProgressEvent) => void;
};
