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
      album_likes: {
        Row: {
          album_artist: string
          album_cover_url: string | null
          album_id: string
          album_title: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          album_artist: string
          album_cover_url?: string | null
          album_id: string
          album_title: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          album_artist?: string
          album_cover_url?: string | null
          album_id?: string
          album_title?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
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
      artist_hidden_items: {
        Row: {
          artist_id: string
          created_at: string
          hidden_by: string
          id: string
          item_id: string
          item_title: string
          item_type: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          hidden_by: string
          id?: string
          item_id: string
          item_title: string
          item_type: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          hidden_by?: string
          id?: string
          item_id?: string
          item_title?: string
          item_type?: string
        }
        Relationships: []
      }
      artist_merges: {
        Row: {
          created_at: string
          created_by: string
          id: string
          master_artist_id: string
          master_artist_name: string
          merged_artist_id: string
          merged_artist_name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          master_artist_id: string
          master_artist_name: string
          merged_artist_id: string
          merged_artist_name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          master_artist_id?: string
          master_artist_name?: string
          merged_artist_id?: string
          merged_artist_name?: string
        }
        Relationships: []
      }
      artist_playlists: {
        Row: {
          artist_id: string
          artist_name: string
          created_at: string
          created_by: string
          id: string
          playlist_cover_url: string | null
          playlist_id: string
          playlist_title: string
          playlist_track_count: number | null
          playlist_type: string
          position: number
          updated_at: string
        }
        Insert: {
          artist_id: string
          artist_name: string
          created_at?: string
          created_by: string
          id?: string
          playlist_cover_url?: string | null
          playlist_id: string
          playlist_title: string
          playlist_track_count?: number | null
          playlist_type?: string
          position?: number
          updated_at?: string
        }
        Update: {
          artist_id?: string
          artist_name?: string
          created_at?: string
          created_by?: string
          id?: string
          playlist_cover_url?: string | null
          playlist_id?: string
          playlist_title?: string
          playlist_track_count?: number | null
          playlist_type?: string
          position?: number
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
      chart_configurations: {
        Row: {
          country_code: string
          id: string
          playlist_id: string
          playlist_title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          country_code: string
          id?: string
          playlist_id: string
          playlist_title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          country_code?: string
          id?: string
          playlist_id?: string
          playlist_title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          album_id: string | null
          content: string
          created_at: string
          id: string
          likes_count: number | null
          parent_id: string | null
          post_id: string | null
          replies_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          album_id?: string | null
          content: string
          created_at?: string
          id?: string
          likes_count?: number | null
          parent_id?: string | null
          post_id?: string | null
          replies_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          album_id?: string | null
          content?: string
          created_at?: string
          id?: string
          likes_count?: number | null
          parent_id?: string | null
          post_id?: string | null
          replies_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      deezer_playlist_covers: {
        Row: {
          cover_url: string
          created_at: string
          deezer_playlist_id: string
          id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          cover_url: string
          created_at?: string
          deezer_playlist_id: string
          id?: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          cover_url?: string
          created_at?: string
          deezer_playlist_id?: string
          id?: string
          updated_at?: string
          updated_by?: string
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
      in_app_notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      lyrics_offsets: {
        Row: {
          created_at: string
          id: string
          offset_seconds: number
          track_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          offset_seconds?: number
          track_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          offset_seconds?: number
          track_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      metadata_update_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          request_type: string
          requested_album: string | null
          requested_artist: string
          requested_cover_url: string | null
          requested_deezer_id: string
          requested_duration: number | null
          requested_title: string
          status: string
          track_artist: string
          track_id: string
          track_title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          request_type?: string
          requested_album?: string | null
          requested_artist: string
          requested_cover_url?: string | null
          requested_deezer_id: string
          requested_duration?: number | null
          requested_title: string
          status?: string
          track_artist: string
          track_id: string
          track_title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          request_type?: string
          requested_album?: string | null
          requested_artist?: string
          requested_cover_url?: string | null
          requested_deezer_id?: string
          requested_duration?: number | null
          requested_title?: string
          status?: string
          track_artist?: string
          track_id?: string
          track_title?: string
          updated_at?: string
          user_id?: string
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
          deezer_id: string | null
          description: string | null
          id: string
          is_public: boolean
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
          deezer_id?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
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
          deezer_id?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
          is_synced?: boolean | null
          name?: string
          spotify_url?: string | null
          track_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          comments_count: number | null
          content: string | null
          created_at: string
          id: string
          likes_count: number | null
          track_album: string | null
          track_album_id: string | null
          track_artist: string | null
          track_cover_url: string | null
          track_duration: number | null
          track_id: string | null
          track_title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comments_count?: number | null
          content?: string | null
          created_at?: string
          id?: string
          likes_count?: number | null
          track_album?: string | null
          track_album_id?: string | null
          track_artist?: string | null
          track_cover_url?: string | null
          track_duration?: number | null
          track_id?: string | null
          track_title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comments_count?: number | null
          content?: string | null
          created_at?: string
          id?: string
          likes_count?: number | null
          track_album?: string | null
          track_album_id?: string | null
          track_artist?: string | null
          track_cover_url?: string | null
          track_duration?: number | null
          track_id?: string | null
          track_title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          audio_source_mode: string | null
          avatar_url: string | null
          bio: string | null
          bio_track_artist: string | null
          bio_track_cover_url: string | null
          bio_track_id: string | null
          bio_track_title: string | null
          created_at: string
          display_name: string | null
          email: string | null
          followers_count: number | null
          following_count: number | null
          id: string
          is_premium: boolean | null
          is_private: boolean | null
          preferred_language: string | null
          premium_expires_at: string | null
          real_debrid_api_key: string | null
          telegram_chat_id: string | null
          updated_at: string
        }
        Insert: {
          audio_source_mode?: string | null
          avatar_url?: string | null
          bio?: string | null
          bio_track_artist?: string | null
          bio_track_cover_url?: string | null
          bio_track_id?: string | null
          bio_track_title?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          followers_count?: number | null
          following_count?: number | null
          id: string
          is_premium?: boolean | null
          is_private?: boolean | null
          preferred_language?: string | null
          premium_expires_at?: string | null
          real_debrid_api_key?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Update: {
          audio_source_mode?: string | null
          avatar_url?: string | null
          bio?: string | null
          bio_track_artist?: string | null
          bio_track_cover_url?: string | null
          bio_track_id?: string | null
          bio_track_title?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          followers_count?: number | null
          following_count?: number | null
          id?: string
          is_premium?: boolean | null
          is_private?: boolean | null
          preferred_language?: string | null
          premium_expires_at?: string | null
          real_debrid_api_key?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recently_played: {
        Row: {
          artist_id: string | null
          created_at: string | null
          id: string
          played_at: string | null
          track_album: string | null
          track_album_id: string | null
          track_artist: string
          track_cover_url: string | null
          track_duration: number | null
          track_id: string
          track_title: string
          user_id: string
        }
        Insert: {
          artist_id?: string | null
          created_at?: string | null
          id?: string
          played_at?: string | null
          track_album?: string | null
          track_album_id?: string | null
          track_artist: string
          track_cover_url?: string | null
          track_duration?: number | null
          track_id: string
          track_title: string
          user_id: string
        }
        Update: {
          artist_id?: string | null
          created_at?: string | null
          id?: string
          played_at?: string | null
          track_album?: string | null
          track_album_id?: string | null
          track_artist?: string
          track_cover_url?: string | null
          track_duration?: number | null
          track_id?: string
          track_title?: string
          user_id?: string
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
      user_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
