export type AudioSourceMode = 'deezer_priority' | 'rd_priority' | 'hybrid_priority';

export interface ScrapingSource {
  id: string;
  name: string;
  edgeFunctionName: string;
}

export const SCRAPING_SOURCES: ScrapingSource[] = [
  { id: 'squidwtf', name: 'SquidWTF', edgeFunctionName: 'squidwtf' },
  { id: 'monochrome', name: 'Monochrome', edgeFunctionName: 'monochrome' },
];

export type FallbackSourceId = 'real-debrid' | 'squidwtf' | 'monochrome';

export const ALL_FALLBACK_SOURCES: { id: FallbackSourceId; name: string }[] = [
  { id: 'real-debrid', name: 'Real-Debrid' },
  { id: 'squidwtf', name: 'SquidWTF' },
  { id: 'monochrome', name: 'Monochrome' },
];

export interface AppSettings {
  language: 'en' | 'it';
  homeDisplayOptions: {
    showRecentlyPlayed: boolean;
    showPlaylists: boolean;
    showNewReleases: boolean;
    showPopularArtists: boolean;
    showTopCharts: boolean;
  };
  feedDisplayOptions: {
    showArtistReleases: boolean;
    showFollowingPosts: boolean;
    showAlbumComments: boolean;
    showFollowingPlaylists: boolean;
  };
  audioQuality: 'high' | 'medium' | 'low';
  crossfade: number;
  realDebridApiKey?: string;
  audioSourceMode: AudioSourceMode;
  selectedScrapingSource: string; // ID of active scraping source
  bridgeUrl: string; // URL of the bridge site
  hybridFallbackChain: FallbackSourceId[]; // ordered fallback chain for hybrid mode
}

export const defaultSettings: AppSettings = {
  language: 'en',
  homeDisplayOptions: {
    showRecentlyPlayed: true,
    showPlaylists: true,
    showNewReleases: true,
    showPopularArtists: true,
    showTopCharts: true,
  },
  feedDisplayOptions: {
    showArtistReleases: true,
    showFollowingPosts: true,
    showAlbumComments: true,
    showFollowingPlaylists: true,
  },
  audioQuality: 'high',
  crossfade: 0,
  realDebridApiKey: undefined,
  audioSourceMode: 'deezer_priority',
  selectedScrapingSource: 'squidwtf',
  bridgeUrl: '',
  hybridFallbackChain: ['real-debrid', 'squidwtf'],
};

export const translations = {
  en: {
    home: 'Home',
    search: 'Search',
    library: 'Library',
    settings: 'Settings',
    profile: 'Profile',
    goodMorning: 'Good morning',
    goodAfternoon: 'Good afternoon',
    goodEvening: 'Good evening',
    whatToListen: 'What do you want to listen to?',
    recentlyPlayed: 'Recently Played',
    yourPlaylists: 'Your Playlists',
    newReleases: 'New Releases',
    popularArtists: 'Popular Artists',
    topCharts: 'Top Charts',
    searchPlaceholder: 'What do you want to listen to?',
    noResults: 'No results for',
    exploreByGenre: 'Explore by genre',
    artists: 'Artists',
    albums: 'Albums',
    tracks: 'Tracks',
    popular: 'Popular',
    discography: 'Discography',
    account: 'Account',
    realDebrid: 'Real-Debrid',
    playback: 'Playback',
    display: 'Display',
    audioQuality: 'Audio Quality',
    crossfade: 'Crossfade',
    language: 'Language',
    homeDisplay: 'Home Display',
    logout: 'Logout',
    login: 'Login',
    email: 'Email',
    password: 'Password',
    apiKey: 'API Key',
    connected: 'Connected',
    high: 'High (320 kbps)',
    medium: 'Medium (160 kbps)',
    low: 'Low (96 kbps)',
    off: 'Off',
    seconds: 'seconds',
    bugs: 'Bugs',
    alternativeSources: 'Alternative Sources',
    selectSource: 'Select a different source',
    noAlternatives: 'No alternative sources found',
    createPlaylist: 'Create Playlist',
    addYourFavorites: 'Add your favorite songs',
    savedSongs: 'Saved Songs',
    playlist: 'Playlist',
    artist: 'Artist',
    album: 'Album',
    cloudFiles: 'Cloud Files',
    noCloudFiles: 'No files saved on Real-Debrid yet',
    loadingCloudFiles: 'Loading cloud files...',
    playFromCloud: 'Play from cloud',
    audioSource: 'Audio Source',
    deezerPriority: 'Scraping Ponte',
    deezerPriorityDesc: 'FLAC/320kbps from bridge site',
    rdPriority: 'Real-Debrid',
    rdPriorityDesc: 'High quality (FLAC/320kbps) when available',
    hybridPriority: 'Hybrid',
    hybridPriorityDesc: 'Custom fallback chain with multiple sources',
    scrapingSource: 'Bridge Site',
    fallbackChain: 'Fallback Order',
    addSource: 'Add source',
    removeSource: 'Remove',
    moveUp: 'Move up',
    moveDown: 'Move down',
  },
  it: {
    home: 'Home',
    search: 'Cerca',
    library: 'Libreria',
    settings: 'Impostazioni',
    profile: 'Profilo',
    goodMorning: 'Buongiorno',
    goodAfternoon: 'Buon pomeriggio',
    goodEvening: 'Buonasera',
    whatToListen: 'Cosa vuoi ascoltare oggi?',
    recentlyPlayed: 'Ascoltate di recente',
    yourPlaylists: 'Le tue playlist',
    newReleases: 'Nuove uscite',
    popularArtists: 'Artisti popolari',
    topCharts: 'Classifiche',
    searchPlaceholder: 'Cosa vuoi ascoltare?',
    noResults: 'Nessun risultato per',
    exploreByGenre: 'Esplora per genere',
    artists: 'Artisti',
    albums: 'Album',
    tracks: 'Brani',
    popular: 'Popolari',
    discography: 'Discografia',
    account: 'Account',
    realDebrid: 'Real-Debrid',
    playback: 'Riproduzione',
    display: 'Display',
    audioQuality: 'Qualità audio',
    crossfade: 'Crossfade',
    language: 'Lingua',
    homeDisplay: 'Display Home',
    logout: 'Esci',
    login: 'Accedi',
    email: 'Email',
    password: 'Password',
    apiKey: 'API Key',
    connected: 'Connesso',
    high: 'Alta (320 kbps)',
    medium: 'Media (160 kbps)',
    low: 'Bassa (96 kbps)',
    off: 'Off',
    seconds: 'secondi',
    bugs: 'Bugs',
    alternativeSources: 'Fonti alternative',
    selectSource: 'Seleziona una fonte diversa',
    noAlternatives: 'Nessuna fonte alternativa trovata',
    createPlaylist: 'Crea playlist',
    addYourFavorites: 'Aggiungi i tuoi brani preferiti',
    savedSongs: 'Brani salvati',
    playlist: 'Playlist',
    artist: 'Artista',
    album: 'Album',
    cloudFiles: 'File Cloud',
    noCloudFiles: 'Nessun file salvato su Real-Debrid',
    loadingCloudFiles: 'Caricamento file cloud...',
    playFromCloud: 'Riproduci da cloud',
    audioSource: 'Sorgente Audio',
    deezerPriority: 'Scraping Ponte',
    deezerPriorityDesc: 'FLAC/320kbps dal sito ponte',
    rdPriority: 'Real-Debrid',
    rdPriorityDesc: 'Alta qualità (FLAC/320kbps) quando disponibile',
    hybridPriority: 'Ibrida',
    hybridPriorityDesc: 'Catena fallback personalizzata con più sorgenti',
    scrapingSource: 'Sito Ponte',
    fallbackChain: 'Ordine Fallback',
    addSource: 'Aggiungi sorgente',
    removeSource: 'Rimuovi',
    moveUp: 'Sposta su',
    moveDown: 'Sposta giù',
  },
};

export type TranslationKey = keyof typeof translations.en;
