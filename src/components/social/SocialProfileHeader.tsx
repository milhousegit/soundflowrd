import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Settings, Camera, Play, Crown, Lock, Loader2, Check, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useSocialProfile, SocialProfile } from '@/hooks/useSocialProfile';
import { usePlayer } from '@/contexts/PlayerContext';
import { searchAll } from '@/lib/deezer';
import { useDebounce } from '@/hooks/useDebounce';
import { Track } from '@/types/music';

interface SocialProfileHeaderProps {
  userId?: string;
  onSettingsClick?: () => void;
}

const SocialProfileHeader: React.FC<SocialProfileHeaderProps> = ({ userId, onSettingsClick }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { playTrack } = usePlayer();
  const { profile, isLoading, isFollowing, updateProfile, followUser, unfollowUser, uploadAvatar } = useSocialProfile(userId);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    display_name: '',
    bio: '',
    is_private: false,
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showBioTrackSearch, setShowBioTrackSearch] = useState(false);
  const [bioTrackQuery, setBioTrackQuery] = useState('');
  const [bioTrackResults, setBioTrackResults] = useState<Track[]>([]);
  const [isSearchingTrack, setIsSearchingTrack] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = !userId || userId === user?.id;

  const handleEditOpen = () => {
    if (profile) {
      setEditForm({
        display_name: profile.display_name || '',
        bio: profile.bio || '',
        is_private: profile.is_private || false,
      });
    }
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsUpdating(true);
    await updateProfile(editForm);
    setIsUpdating(false);
    setIsEditing(false);
  };

  const handleAvatarClick = () => {
    if (isOwnProfile) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    await uploadAvatar(file);
    setIsUploading(false);
  };

  const handleFollowToggle = async () => {
    if (isFollowing) {
      await unfollowUser();
    } else {
      await followUser();
    }
  };

  const searchBioTrack = async (query: string) => {
    if (!query.trim()) {
      setBioTrackResults([]);
      return;
    }
    setIsSearchingTrack(true);
    try {
      const data = await searchAll(query);
      setBioTrackResults(data.tracks.slice(0, 5));
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearchingTrack(false);
    }
  };

  const debouncedBioSearch = useDebounce(searchBioTrack, 300);

  const handleBioTrackSelect = async (track: Track) => {
    await updateProfile({
      bio_track_id: track.id,
      bio_track_title: track.title,
      bio_track_artist: track.artist,
      bio_track_cover_url: track.coverUrl,
    });
    setShowBioTrackSearch(false);
    setBioTrackQuery('');
    setBioTrackResults([]);
  };

  const handlePlayBioTrack = () => {
    if (!profile?.bio_track_id) return;
    const track = {
      id: profile.bio_track_id,
      title: profile.bio_track_title || '',
      artist: profile.bio_track_artist || '',
      album: '',
      coverUrl: profile.bio_track_cover_url || '',
      duration: 0,
    };
    playTrack(track, [track]);
  };

  const handleRemoveBioTrack = async () => {
    await updateProfile({
      bio_track_id: null,
      bio_track_title: null,
      bio_track_artist: null,
      bio_track_cover_url: null,
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {settings.language === 'it' ? 'Profilo non trovato' : 'Profile not found'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        {/* Settings button for own profile */}
        {isOwnProfile && onSettingsClick && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onSettingsClick}
            className="absolute top-0 right-0 z-10"
          >
            <Settings className="w-5 h-5" />
          </Button>
        )}

        <div className="flex flex-col items-center text-center space-y-4">
          {/* Avatar */}
          <div className="relative">
            <button
              onClick={handleAvatarClick}
              disabled={!isOwnProfile || isUploading}
              className="relative w-24 h-24 rounded-full bg-muted overflow-hidden ring-4 ring-background"
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-10 h-10 text-muted-foreground" />
                </div>
              )}
              {isOwnProfile && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  {isUploading ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </div>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            {profile.is_premium && (
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] flex items-center justify-center">
                <Crown className="w-3.5 h-3.5 text-white" />
              </div>
            )}
          </div>

          {/* Name & Bio */}
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-xl font-bold text-foreground">
                {profile.display_name || profile.email?.split('@')[0] || 'Utente'}
              </h1>
              {profile.is_private && <Lock className="w-4 h-4 text-muted-foreground" />}
            </div>
            {profile.bio && (
              <p className="text-sm text-muted-foreground max-w-xs">{profile.bio}</p>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6">
            <button className="text-center">
              <p className="text-lg font-bold text-foreground">{profile.followers_count}</p>
              <p className="text-xs text-muted-foreground">
                {settings.language === 'it' ? 'Follower' : 'Followers'}
              </p>
            </button>
            <button className="text-center">
              <p className="text-lg font-bold text-foreground">{profile.following_count}</p>
              <p className="text-xs text-muted-foreground">
                {settings.language === 'it' ? 'Seguiti' : 'Following'}
              </p>
            </button>
          </div>

          {/* Bio track */}
          {profile.bio_track_id ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 w-full max-w-xs">
              <button
                onClick={handlePlayBioTrack}
                className="relative w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0"
              >
                {profile.bio_track_cover_url ? (
                  <img src={profile.bio_track_cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Play className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <Play className="w-5 h-5 text-white fill-white" />
                </div>
              </button>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium truncate">{profile.bio_track_title}</p>
                <p className="text-xs text-muted-foreground truncate">{profile.bio_track_artist}</p>
              </div>
              {isOwnProfile && (
                <Button variant="ghost" size="iconSm" onClick={handleRemoveBioTrack}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ) : isOwnProfile ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBioTrackSearch(true)}
              className="gap-2"
            >
              <Play className="w-4 h-4" />
              {settings.language === 'it' ? 'Aggiungi brano preferito' : 'Add favorite track'}
            </Button>
          ) : null}

          {/* Action buttons */}
          {isOwnProfile ? (
            <Button variant="outline" onClick={handleEditOpen} className="gap-2">
              <Pencil className="w-4 h-4" />
              {settings.language === 'it' ? 'Modifica profilo' : 'Edit profile'}
            </Button>
          ) : (
            <Button
              variant={isFollowing ? 'outline' : 'default'}
              onClick={handleFollowToggle}
            >
              {isFollowing
                ? settings.language === 'it' ? 'Smetti di seguire' : 'Unfollow'
                : settings.language === 'it' ? 'Segui' : 'Follow'}
            </Button>
          )}
        </div>
      </div>

      {/* Edit modal */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {settings.language === 'it' ? 'Modifica profilo' : 'Edit profile'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">
                {settings.language === 'it' ? 'Nome visualizzato' : 'Display name'}
              </label>
              <Input
                value={editForm.display_name}
                onChange={(e) => setEditForm(prev => ({ ...prev, display_name: e.target.value }))}
                placeholder="Il tuo nome"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Bio</label>
              <Textarea
                value={editForm.bio}
                onChange={(e) => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
                placeholder={settings.language === 'it' ? 'Scrivi qualcosa su di te...' : 'Write something about yourself...'}
                maxLength={200}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                {settings.language === 'it' ? 'Profilo privato' : 'Private profile'}
              </label>
              <Switch
                checked={editForm.is_private}
                onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, is_private: checked }))}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsEditing(false)} className="flex-1">
                {settings.language === 'it' ? 'Annulla' : 'Cancel'}
              </Button>
              <Button onClick={handleSave} disabled={isUpdating} className="flex-1">
                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  settings.language === 'it' ? 'Salva' : 'Save'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bio track search modal */}
      <Dialog open={showBioTrackSearch} onOpenChange={setShowBioTrackSearch}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {settings.language === 'it' ? 'Scegli brano preferito' : 'Choose favorite track'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder={settings.language === 'it' ? 'Cerca un brano...' : 'Search for a track...'}
              value={bioTrackQuery}
              onChange={(e) => {
                setBioTrackQuery(e.target.value);
                debouncedBioSearch(e.target.value);
              }}
            />
            {isSearchingTrack && (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {bioTrackResults.length > 0 && (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {bioTrackResults.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => handleBioTrackSelect(track)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded bg-muted overflow-hidden shrink-0">
                      {track.coverUrl && (
                        <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{track.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SocialProfileHeader;
