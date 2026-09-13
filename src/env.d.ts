/// <reference types="vite/client" />
import type { MediaItem } from './store';
declare global {
  interface Window {
    videe?: { platform: string; pickFolder(): Promise<{ name: string; records: MediaItem[] } | null>; importFiles(files: File[]): Promise<MediaItem[]>; getSource(id: string): Promise<string>; forgetVideo(id: string): Promise<void>; convertVideo(id: string): Promise<string>; cutVideo(id: string, start: number, end: number, duration: number): Promise<{src: string; size: number}>; cancelConversion(): Promise<void>; onConversionProgress(cb: (value: {id: string; seconds: number}) => void): () => void };
  }
}
