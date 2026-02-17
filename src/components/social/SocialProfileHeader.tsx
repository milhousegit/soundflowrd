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
import FollowListModal from './FollowListModal';
import WrappedRing from './WrappedRing';

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
  const [followListType, setFollowListType] = useState<'followers' | 'following' | null>(null);
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
      <div className="relative p-4 pt-4">
        {/* Edit button for own profile - top left */}
        {isOwnProfile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleEditOpen}
            className="absolute top-4 left-4 z-10"
          >
            <Pencil className="w-5 h-5" />
          </Button>
        )}

        {/* Settings button for own profile - top right */}
        {isOwnProfile && onSettingsClick && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onSettingsClick}
            className="absolute top-4 right-4 z-10"
          >
            <Settings className="w-5 h-5" />
          </Button>
        )}

        <div className="flex flex-col items-center text-center space-y-4 pt-8">
          {/* Avatar - with Wrapped ring for admin */}
          <div className="relative">
            {/* Show Wrapped ring for everyone from Dec 25 to Dec 31 (disappears Jan 1 midnight) */}
            {(() => {
              const now = new Date();
              const month = now.getMonth(); // 0-indexed: 11 = December
              const day = now.getDate();
              const isWrappedSeason = month === 11 && day >= 25;
              return isWrappedSeason;
            })() ? (
              <WrappedRing
                avatarUrl={profile.avatar_url}
                displayName={profile.display_name || profile.email?.split('@')[0]}
                isPremium={profile.is_premium || false}
              />
            ) : (
              <div className="relative w-24 h-24 rounded-full bg-muted overflow-hidden ring-4 ring-background">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-10 h-10 text-muted-foreground" />
                  </div>
                )}
              </div>
            )}
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
              {(profile as any).is_admin && (
                <Crown className="w-4 h-4 text-amber-500" />
              )}
              {!(profile as any).is_admin && profile.is_premium && (
                <Crown className="w-4 h-4 text-[#8B5CF6]" />
              )}
            </div>
            {profile.bio && (
              <p className="text-sm text-muted-foreground max-w-xs">{profile.bio}</p>
            )}
            
            {/* Minimal bio track - right under bio */}
            {profile.bio_track_id && (
              <button
                onClick={handlePlayBioTrack}
                className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                <Play className="w-3 h-3 fill-current" />
                <span className="truncate max-w-[200px]">
                  {profile.bio_track_title} • {profile.bio_track_artist}
                </span>
                {isOwnProfile && (
                  <X 
                    className="w-3 h-3 ml-1 hover:text-destructive" 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveBioTrack();
                    }}
                  />
                )}
              </button>
            )}
            
            {/* Add bio track button - only show if no track and own profile */}
            {!profile.bio_track_id && isOwnProfile && (
              <button
                onClick={() => setShowBioTrackSearch(true)}
                className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                <Play className="w-3 h-3" />
                {settings.language === 'it' ? 'Aggiungi brano' : 'Add track'}
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6">
            <button 
              type="button"
              className="text-center hover:opacity-70 transition-opacity"
              onClick={() => setFollowListType('followers')}
            >
              <p className="text-lg font-bold text-foreground">{profile.followers_count ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                {settings.language === 'it' ? 'Follower' : 'Followers'}
              </p>
            </button>
            <button 
              type="button"
              className="text-center hover:opacity-70 transition-opacity"
              onClick={() => setFollowListType('following')}
            >
              <p className="text-lg font-bold text-foreground">{profile.following_count ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                {settings.language === 'it' ? 'Seguiti' : 'Following'}
              </p>
            </button>
          </div>

          {/* Follow button for other profiles */}
          {!isOwnProfile && (
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
            {/* Avatar change in edit modal */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="relative w-20 h-20 rounded-full bg-muted overflow-hidden ring-2 ring-border group"
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {isUploading ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5 text-white" />
                  )}
                </div>
              </button>
              <p className="text-xs text-muted-foreground mt-2">
                {settings.language === 'it' ? 'Tocca per cambiare' : 'Tap to change'}
              </p>
            </div>

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

      {/* Follow list modal */}
      <FollowListModal
        open={!!followListType}
        onOpenChange={(open) => !open && setFollowListType(null)}
        userId={profile.id}
        type={followListType || 'followers'}
      />
    </>
  );
};

export default SocialProfileHeader;
