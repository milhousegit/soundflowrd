import React, { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Loader2, X, Image as ImageIcon, Link } from 'lucide-react';
import { usePlaylistCoverUpload } from '@/hooks/usePlaylistCoverUpload';
import { cn } from '@/lib/utils';

interface CoverImageUploaderProps {
  currentUrl: string;
  onUrlChange: (url: string) => void;
  userId: string;
  placeholder?: string;
  className?: string;
  previewSize?: 'sm' | 'md' | 'lg';
  showUrlInput?: boolean;
}

const CoverImageUploader: React.FC<CoverImageUploaderProps> = ({
  currentUrl,
  onUrlChange,
  userId,
  placeholder = 'Trascina un\'immagine o clicca per caricare',
  className,
  previewSize = 'md',
  showUrlInput = true,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');
  const { uploadCover, isUploading } = usePlaylistCoverUpload();

  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
  };

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return;
    
    const url = await uploadCover(file, userId);
    if (url) {
      onUrlChange(url);
    }
  }, [uploadCover, userId, onUrlChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleRemove = () => {
    onUrlChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Mode selector */}
      {showUrlInput && (
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <Button
            type="button"
            variant={inputMode === 'upload' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1 text-xs gap-1"
            onClick={() => setInputMode('upload')}
          >
            <Upload className="w-3 h-3" />
            Carica
          </Button>
          <Button
            type="button"
            variant={inputMode === 'url' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1 text-xs gap-1"
            onClick={() => setInputMode('url')}
          >
            <Link className="w-3 h-3" />
            URL
          </Button>
        </div>
      )}

      {/* URL Input Mode */}
      {inputMode === 'url' && showUrlInput && (
        <div className="flex gap-2">
          <Input
            placeholder="https://..."
            value={currentUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            disabled={isUploading}
          />
          {currentUrl && (
            <div className={cn('rounded bg-secondary overflow-hidden flex-shrink-0', sizeClasses.sm)}>
              <img
                src={currentUrl}
                alt="Cover preview"
                className="w-full h-full object-cover"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            </div>
          )}
        </div>
      )}

      {/* Upload Mode */}
      {inputMode === 'upload' && (
        <div className="flex items-start gap-3">
          {/* Drop zone */}
          <div
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'flex-1 border-2 border-dashed rounded-lg p-4 transition-all cursor-pointer',
              'flex flex-col items-center justify-center text-center',
              isDragOver 
                ? 'border-primary bg-primary/10' 
                : 'border-border hover:border-primary/50 hover:bg-muted/50',
              isUploading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleInputChange}
              className="hidden"
              disabled={isUploading}
            />
            
            {isUploading ? (
              <>
                <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                <p className="text-sm text-muted-foreground">Caricamento...</p>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">{placeholder}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Max 5MB • JPG, PNG, WebP
                </p>
              </>
            )}
          </div>

          {/* Preview */}
          {currentUrl && (
            <div className="relative flex-shrink-0">
              <div className={cn('rounded-lg overflow-hidden bg-secondary', sizeClasses[previewSize])}>
                <img
                  src={currentUrl}
                  alt="Cover preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
              </div>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full"
                onClick={handleRemove}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CoverImageUploader;
