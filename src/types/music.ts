export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  duration: number;
  coverUrl?: string;
  streamUrl?: string;
}

export interface Artist {
  id: string;
  name: string;
  imageUrl?: string;
  genres?: string[];
  popularity?: number;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  coverUrl?: string;
  releaseDate?: string;
  tracks?: Track[];
  trackCount?: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  tracks: Track[];
  createdAt: Date;
}

export interface UserCredentials {
  email: string;
  password: string;
  realDebridApiKey: string;
}

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  queue: Track[];
  queueIndex: number;
}
