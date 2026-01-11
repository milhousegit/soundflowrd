export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      album_torrent_mappings: {
        Row: {
          album_id: string
          album_title: string
          artist_name: string
          created_at: string
          id: string
          torrent_id: string
          torrent_title: string
          updated_at: string
        }
        Insert: {
          album_id: string
          album_title: string
          artist_name: string
          created_at?: string
          id?: string
          torrent_id: string
          torrent_title: string
          updated_at?: string
        }
        Update: {
          album_id?: string
          album_title?: string
          artist_name?: string
          created_at?: string
          id?: string
          torrent_id?: string
          torrent_title?: string
          updated_at?: string
        }
        Relationships: []
      }
      artist_release_tracking: {
        Row: {
          artist_id: string
          artist_name: string
          created_at: string
          id: string
          last_album_id: string | null
          last_check_at: string
          user_id: string
        }
        Insert: {
          artist_id: string
          artist_name: string
          created_at?: string
          id?: string
          last_album_id?: string | null
          last_check_at?: string
          user_id: string
        }
        Update: {
          artist_id?: string
          artist_name?: string
          created_at?: string
          id?: string
          last_album_id?: string | null
          last_check_at?: string
          user_id?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          item_artist: string | null
          item_cover_url: string | null
          item_data: Json | null
          item_id: string
          item_title: string
          item_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_artist?: string | null
          item_cover_url?: string | null
          item_data?: Json | null
          item_id: string
          item_title: string
          item_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_artist?: string | null
          item_cover_url?: string | null
          item_data?: Json | null
          item_id?: string
          item_title?: string
          item_type?: string
          user_id?: string
        }
        Relationships: []
      }
      home_content_cache: {
        Row: {
          content_type: string
          country: string
          created_at: string
          data: Json
          id: string
          language: string
          updated_at: string
        }
        Insert: {
          content_type: string
          country?: string
          created_at?: string
          data?: Json
          id?: string
          language?: string
          updated_at?: string
        }
        Update: {
          content_type?: string
          country?: string
          created_at?: string
          data?: Json
          id?: string
          language?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_subscriptions: {
        Row: {
          auth: string
          created_at: string
          enabled: boolean
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          enabled?: boolean
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      playlist_tracks: {
        Row: {
          added_at: string
          id: string
          playlist_id: string
          position: number
          track_album: string | null
          track_album_id: string | null
          track_artist: string
          track_cover_url: string | null
          track_duration: number | null
          track_id: string
          track_title: string
        }
        Insert: {
          added_at?: string
          id?: string
          playlist_id: string
          position: number
          track_album?: string | null
          track_album_id?: string | null
          track_artist: string
          track_cover_url?: string | null
          track_duration?: number | null
          track_id: string
          track_title: string
        }
        Update: {
          added_at?: string
          id?: string
          playlist_id?: string
          position?: number
          track_album?: string | null
          track_album_id?: string | null
          track_artist?: string
          track_cover_url?: string | null
          track_duration?: number | null
          track_id?: string
          track_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_tracks_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_synced: boolean | null
          name: string
          spotify_url: string | null
          track_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_synced?: boolean | null
          name: string
          spotify_url?: string | null
          track_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_synced?: boolean | null
          name?: string
          spotify_url?: string | null
          track_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          audio_source_mode: string | null
          created_at: string
          email: string | null
          id: string
          preferred_language: string | null
          real_debrid_api_key: string | null
          updated_at: string
        }
        Insert: {
          audio_source_mode?: string | null
          created_at?: string
          email?: string | null
          id: string
          preferred_language?: string | null
          real_debrid_api_key?: string | null
          updated_at?: string
        }
        Update: {
          audio_source_mode?: string | null
          created_at?: string
          email?: string | null
          id?: string
          preferred_language?: string | null
          real_debrid_api_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      track_file_mappings: {
        Row: {
          album_mapping_id: string
          created_at: string
          direct_link: string | null
          direct_link_expires_at: string | null
          file_id: number
          file_name: string
          file_path: string
          id: string
          track_id: string
          track_position: number | null
          track_title: string
        }
        Insert: {
          album_mapping_id: string
          created_at?: string
          direct_link?: string | null
          direct_link_expires_at?: string | null
          file_id: number
          file_name: string
          file_path: string
          id?: string
          track_id: string
          track_position?: number | null
          track_title: string
        }
        Update: {
          album_mapping_id?: string
          created_at?: string
          direct_link?: string | null
          direct_link_expires_at?: string | null
          file_id?: number
          file_name?: string
          file_path?: string
          id?: string
          track_id?: string
          track_position?: number | null
          track_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_file_mappings_album_mapping_id_fkey"
            columns: ["album_mapping_id"]
            isOneToOne: false
            referencedRelation: "album_torrent_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_track_mappings: {
        Row: {
          created_at: string
          id: string
          track_id: string
          updated_at: string
          uploader_name: string | null
          video_duration: number | null
          video_id: string
          video_title: string
        }
        Insert: {
          created_at?: string
          id?: string
          track_id: string
          updated_at?: string
          uploader_name?: string | null
          video_duration?: number | null
          video_id: string
          video_title: string
        }
        Update: {
          created_at?: string
          id?: string
          track_id?: string
          updated_at?: string
          uploader_name?: string | null
          video_duration?: number | null
          video_id?: string
          video_title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
