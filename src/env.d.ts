/// <reference types="vite/client" />
import type { MediaItem } from './store';
export type MediaInfo = {
  format: string; duration: number; start: number; bitrate: number; subtitles: number;
  video: null | { codec: string; profile: string; pixFmt: string; width: number; height: number; fps: number; interlaced: boolean; bitDepth: number; chroma: string; rotation: number };
  audio: { codec: string; profile: string; channels: string; sampleRate: number; language: string }[];
};
export type PlaybackPlan = { mode: 'direct' | 'remux' | 'transcode'; reasons: string[]; audio: 'copy' | 'aac' | 'none'; deinterlace: boolean };
export type Analysis = { info: MediaInfo; plan: PlaybackPlan; known: boolean; converted: '' | 'optimized' | 'edited'; size: number };
export type ExportOptions = { segments: { start: number; end: number }[]; duration: number; mode: 'encode' | 'copy'; codec: 'h264' | 'hevc'; quality: 'high' | 'standard' | 'small'; height: number; audio: boolean; rotate: number; fps: number; hardware: boolean; destination: 'file' | 'apply'; addToLibrary: boolean };
declare global {
  interface Window {
    videe?: {
      platform: string;
      getGpuStatus(): Promise<{ videoDecode: string; gpuCompositing: string; rasterization: string; encoder?: string }>;
      pickFiles(): Promise<MediaItem[] | null>;
      pickFolder(): Promise<{ name: string; records: MediaItem[]; folders?: { name: string; ids: string[] }[] } | null>;
      importFiles(files: File[]): Promise<MediaItem[]>;
      getSource(id: string): Promise<string>;
      analyzeVideo(id: string): Promise<Analysis>;
      liveSource(id: string, start: number, hardware?: boolean): Promise<string>;
      stopLive(): Promise<void>;
      prepareVideo(id: string): Promise<{ src: string; size: number }>;
      useOriginal(id: string): Promise<void>;
      thumbnail(id: string): Promise<{ thumbnail: string; duration: number }>;
      filmstrip(id: string, count: number): Promise<(string | null)[]>;
      snapshot(id: string, time: number): Promise<string | null>;
      exportVideo(id: string, options: ExportOptions): Promise<null | { path: string; size: number; src?: string; record?: MediaItem | null }>;
      revealFile(file: string): Promise<void>;
      revealVideo(id: string): Promise<void>;
      cacheInfo(): Promise<{ bytes: number }>;
      clearCache(): Promise<{ freed: number }>;
      forgetVideo(id: string): Promise<void>;
      convertVideo(id: string): Promise<string>;
      cancelConversion(): Promise<void>;
      listSubtitles(id: string): Promise<{ index: number; language: string; codec: string; label: string }[]>;
      extractSubtitle(id: string, index: number): Promise<string>;
      onConversionProgress(cb: (value: { id: string; seconds: number; total?: number }) => void): () => void;
    };
  }
}
