import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

interface UsePlaylistCoverUploadReturn {
  uploadCover: (file: File, userId: string) => Promise<string | null>;
  isUploading: boolean;
  uploadProgress: number;
}

export const usePlaylistCoverUpload = (): UsePlaylistCoverUploadReturn => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadCover = useCallback(async (file: File, userId: string): Promise<string | null> => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Per favore seleziona un file immagine');
      return null;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('L\'immagine non può superare i 5MB');
      return null;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${userId}/${uuidv4()}.${fileExt}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('playlist-covers')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error);
        toast.error('Errore durante il caricamento dell\'immagine');
        return null;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('playlist-covers')
        .getPublicUrl(data.path);

      setUploadProgress(100);
      return urlData.publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Errore durante il caricamento dell\'immagine');
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  return { uploadCover, isUploading, uploadProgress };
};
