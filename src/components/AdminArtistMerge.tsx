import React, { useState, useEffect } from 'react';
import { Search, Loader2, Link2, Trash2, X, Check, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { searchArtists } from '@/lib/deezer';
import { Artist } from '@/types/music';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface ArtistMerge {
  id: string;
  master_artist_id: string;
  master_artist_name: string;
  merged_artist_id: string;
  merged_artist_name: string;
  created_at: string;
}

interface AdminArtistMergeProps {
  language: string;
}

const AdminArtistMerge: React.FC<AdminArtistMergeProps> = ({ language }) => {
  const { user } = useAuth();
  const [merges, setMerges] = useState<ArtistMerge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Search states
  const [masterSearch, setMasterSearch] = useState('');
  const [mergedSearch, setMergedSearch] = useState('');
  const [masterResults, setMasterResults] = useState<Artist[]>([]);
  const [mergedResults, setMergedResults] = useState<Artist[]>([]);
  const [isSearchingMaster, setIsSearchingMaster] = useState(false);
  const [isSearchingMerged, setIsSearchingMerged] = useState(false);
  
  // Selected artists
  const [selectedMaster, setSelectedMaster] = useState<Artist | null>(null);
  const [selectedMerged, setSelectedMerged] = useState<Artist | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);

  const t = {
    title: language === 'it' ? 'Unisci Metadati Artisti' : 'Merge Artist Metadata',
    masterArtist: language === 'it' ? 'Artista Master (principale)' : 'Master Artist (primary)',
    mergedArtist: language === 'it' ? 'Artista da unire (nascosto)' : 'Artist to merge (hidden)',
    search: language === 'it' ? 'Cerca artista...' : 'Search artist...',
    merge: language === 'it' ? 'Unisci' : 'Merge',
    existingMerges: language === 'it' ? 'Unioni esistenti' : 'Existing merges',
    noMerges: language === 'it' ? 'Nessuna unione configurata' : 'No merges configured',
    merged: language === 'it' ? 'unito a' : 'merged into',
    delete: language === 'it' ? 'Elimina' : 'Delete',
    success: language === 'it' ? 'Artisti uniti con successo!' : 'Artists merged successfully!',
    deleted: language === 'it' ? 'Unione eliminata' : 'Merge deleted',
    alreadyMerged: language === 'it' ? 'Questo artista è già stato unito' : 'This artist is already merged',
    selectBoth: language === 'it' ? 'Seleziona entrambi gli artisti' : 'Select both artists',
  };

  // Load existing merges
  useEffect(() => {
    loadMerges();
  }, []);

  const loadMerges = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('artist_merges')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMerges((data as ArtistMerge[]) || []);
    } catch (error) {
      console.error('Failed to load merges:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Search master artist
  const handleSearchMaster = async () => {
    if (!masterSearch.trim()) return;
    setIsSearchingMaster(true);
    try {
      const results = await searchArtists(masterSearch);
      setMasterResults(results.slice(0, 5));
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearchingMaster(false);
    }
  };

  // Search merged artist
  const handleSearchMerged = async () => {
    if (!mergedSearch.trim()) return;
    setIsSearchingMerged(true);
    try {
      const results = await searchArtists(mergedSearch);
      setMergedResults(results.slice(0, 5));
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearchingMerged(false);
    }
  };

  // Handle merge
  const handleMerge = async () => {
    if (!selectedMaster || !selectedMerged || !user) {
      toast.error(t.selectBoth);
      return;
    }

    // Check if already merged
    const existingMerge = merges.find(m => m.merged_artist_id === selectedMerged.id);
    if (existingMerge) {
      toast.error(t.alreadyMerged);
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('artist_merges')
        .insert({
          master_artist_id: selectedMaster.id,
          master_artist_name: selectedMaster.name,
          merged_artist_id: selectedMerged.id,
          merged_artist_name: selectedMerged.name,
          created_by: user.id,
        });

      if (error) throw error;

      toast.success(t.success);
      
      // Reset
      setSelectedMaster(null);
      setSelectedMerged(null);
      setMasterSearch('');
      setMergedSearch('');
      setMasterResults([]);
      setMergedResults([]);
      
      loadMerges();
    } catch (error: any) {
      console.error('Failed to merge:', error);
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('artist_merges')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success(t.deleted);
      setMerges(prev => prev.filter(m => m.id !== id));
    } catch (error: any) {
      console.error('Failed to delete:', error);
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {language === 'it' 
          ? 'Unisci artisti duplicati: il secondo verrà nascosto dalla ricerca e i suoi contenuti appariranno sotto il Master.'
          : 'Merge duplicate artists: the second will be hidden from search and its content will appear under Master.'}
      </p>

      {/* Master Artist Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">{t.masterArtist}</label>
        
        {selectedMaster ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
            <img 
              src={selectedMaster.imageUrl || '/placeholder.svg'} 
              alt={selectedMaster.name}
              className="w-10 h-10 rounded-full object-cover"
            />
            <span className="flex-1 font-medium text-foreground">{selectedMaster.name}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedMaster(null)}
              className="w-8 h-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                value={masterSearch}
                onChange={(e) => setMasterSearch(e.target.value)}
                placeholder={t.search}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchMaster()}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleSearchMaster}
                disabled={isSearchingMaster}
              >
                {isSearchingMaster ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            
            {masterResults.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {masterResults.map((artist) => (
                  <button
                    key={artist.id}
                    onClick={() => {
                      setSelectedMaster(artist);
                      setMasterResults([]);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <img 
                      src={artist.imageUrl || '/placeholder.svg'} 
                      alt={artist.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                    <span className="text-sm text-foreground">{artist.name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Merged Artist Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">{t.mergedArtist}</label>
        
        {selectedMerged ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <img 
              src={selectedMerged.imageUrl || '/placeholder.svg'} 
              alt={selectedMerged.name}
              className="w-10 h-10 rounded-full object-cover"
            />
            <span className="flex-1 font-medium text-foreground">{selectedMerged.name}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedMerged(null)}
              className="w-8 h-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                value={mergedSearch}
                onChange={(e) => setMergedSearch(e.target.value)}
                placeholder={t.search}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchMerged()}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleSearchMerged}
                disabled={isSearchingMerged}
              >
                {isSearchingMerged ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            
            {mergedResults.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {mergedResults.map((artist) => (
                  <button
                    key={artist.id}
                    onClick={() => {
                      setSelectedMerged(artist);
                      setMergedResults([]);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <img 
                      src={artist.imageUrl || '/placeholder.svg'} 
                      alt={artist.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                    <span className="text-sm text-foreground">{artist.name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Merge Button */}
      <Button
        onClick={handleMerge}
        disabled={!selectedMaster || !selectedMerged || isSaving}
        className="w-full gap-2"
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
        {t.merge}
      </Button>

      {/* Existing Merges */}
      <div className="pt-4 border-t border-border">
        <h3 className="text-sm font-medium text-foreground mb-3">{t.existingMerges}</h3>
        
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : merges.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">{t.noMerges}</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {merges.map((merge) => (
              <div 
                key={merge.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm"
              >
                <Music className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span className="text-muted-foreground truncate">{merge.merged_artist_name}</span>
                <span className="text-muted-foreground">→</span>
                <span className="text-primary font-medium truncate">{merge.master_artist_name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(merge.id)}
                  className="w-7 h-7 ml-auto text-destructive hover:text-destructive flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminArtistMerge;
