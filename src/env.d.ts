/// <reference types="vite/client" />
import type { MediaItem } from './store';
declare global { interface Window { videe?: { platform: string; pickVideos(): Promise<MediaItem[]>; importFiles(files: File[]): Promise<MediaItem[]>; getSource(id: string): Promise<string>; forgetVideo(id: string): Promise<void>; convertVideo(id: string): Promise<string>; cancelConversion(): Promise<void>; onConversionProgress(cb: (value: {id: string; seconds: number}) => void): () => void } } }
