export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      admission_documents: {
        Row: {
          created_at: string;
          doc_type: string;
          enquiry_id: string;
          file_url: string | null;
          id: string;
          updated_at: string;
          verified: boolean;
        };
        Insert: {
          created_at?: string;
          doc_type: string;
          enquiry_id: string;
          file_url?: string | null;
          id?: string;
          updated_at?: string;
          verified?: boolean;
        };
        Update: {
          created_at?: string;
          doc_type?: string;
          enquiry_id?: string;
          file_url?: string | null;
          id?: string;
          updated_at?: string;
          verified?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "admission_documents_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: false;
            referencedRelation: "admission_enquiries";
            referencedColumns: ["id"];
          },
        ];
      };
      admission_enquiries: {
        Row: {
          admission_no: string | null;
          converted_student_id: string | null;
          created_at: string;
          enquiry_date: string;
          grade_applying: string | null;
          id: string;
          notes: string | null;
          parent_email: string | null;
          parent_name: string | null;
          parent_phone: string | null;
          status: string;
          student_name: string;
          updated_at: string;
        };
        Insert: {
          admission_no?: string | null;
          converted_student_id?: string | null;
          created_at?: string;
          enquiry_date?: string;
          grade_applying?: string | null;
          id?: string;
          notes?: string | null;
          parent_email?: string | null;
          parent_name?: string | null;
          parent_phone?: string | null;
          status?: string;
          student_name: string;
          updated_at?: string;
        };
        Update: {
          admission_no?: string | null;
          converted_student_id?: string | null;
          created_at?: string;
          enquiry_date?: string;
          grade_applying?: string | null;
          id?: string;
          notes?: string | null;
          parent_email?: string | null;
          parent_name?: string | null;
          parent_phone?: string | null;
          status?: string;
          student_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admission_enquiries_converted_student_id_fkey";
            columns: ["converted_student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["announcement_audience"];
          author_id: string;
          body: string;
          class_id: string | null;
          created_at: string;
          id: string;
          title: string;
        };
        Insert: {
          audience?: Database["public"]["Enums"]["announcement_audience"];
          author_id: string;
          body: string;
          class_id?: string | null;
          created_at?: string;
          id?: string;
          title: string;
        };
        Update: {
          audience?: Database["public"]["Enums"]["announcement_audience"];
          author_id?: string;
          body?: string;
          class_id?: string | null;
          created_at?: string;
          id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcements_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
        ];
      };
      asset_allocations: {
        Row: {
          allocated_at: string;
          asset_id: string;
          assignee_label: string;
          assignee_profile_id: string | null;
          created_at: string;
          expected_return_at: string | null;
          id: string;
          notes: string | null;
          return_condition: string | null;
          returned_at: string | null;
          updated_at: string;
        };
        Insert: {
          allocated_at?: string;
          asset_id: string;
          assignee_label: string;
          assignee_profile_id?: string | null;
          created_at?: string;
          expected_return_at?: string | null;
          id?: string;
          notes?: string | null;
          return_condition?: string | null;
          returned_at?: string | null;
          updated_at?: string;
        };
        Update: {
          allocated_at?: string;
          asset_id?: string;
          assignee_label?: string;
          assignee_profile_id?: string | null;
          created_at?: string;
          expected_return_at?: string | null;
          id?: string;
          notes?: string | null;
          return_condition?: string | null;
          returned_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "asset_allocations_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_allocations_assignee_profile_id_fkey";
            columns: ["assignee_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_allocations_assignee_profile_id_fkey";
            columns: ["assignee_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles_public";
            referencedColumns: ["id"];
          },
        ];
      };
      asset_amc: {
        Row: {
          asset_id: string;
          coverage: string | null;
          created_at: string;
          end_date: string;
          id: string;
          notes: string | null;
          start_date: string;
          updated_at: string;
          vendor_id: string | null;
        };
        Insert: {
          asset_id: string;
          coverage?: string | null;
          created_at?: string;
          end_date: string;
          id?: string;
          notes?: string | null;
          start_date: string;
          updated_at?: string;
          vendor_id?: string | null;
        };
        Update: {
          asset_id?: string;
          coverage?: string | null;
          created_at?: string;
          end_date?: string;
          id?: string;
          notes?: string | null;
          start_date?: string;
          updated_at?: string;
          vendor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "asset_amc_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_amc_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "asset_vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      asset_categories: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "asset_categories_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_categories_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles_public";
            referencedColumns: ["id"];
          },
        ];
      };
      asset_maintenance: {
        Row: {
          asset_id: string;
          completed_at: string | null;
          cost: number | null;
          created_at: string;
          id: string;
          notes: string | null;
          performed_by: string | null;
          scheduled_for: string | null;
          status: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          asset_id: string;
          completed_at?: string | null;
          cost?: number | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          performed_by?: string | null;
          scheduled_for?: string | null;
          status?: string;
          type?: string;
          updated_at?: string;
        };
        Update: {
          asset_id?: string;
          completed_at?: string | null;
          cost?: number | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          performed_by?: string | null;
          scheduled_for?: string | null;
          status?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "asset_maintenance_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
      asset_vendors: {
        Row: {
          category_hint: string | null;
          contact_name: string | null;
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          category_hint?: string | null;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          category_hint?: string | null;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      assets: {
        Row: {
          asset_code: string | null;
          assigned_to_label: string | null;
          assigned_to_profile_id: string | null;
          barcode_value: string | null;
          category: string | null;
          category_id: string | null;
          condition: string;
          created_at: string;
          current_value: number | null;
          id: string;
          invoice_ref: string | null;
          location: string | null;
          name: string;
          notes: string | null;
          purchase_date: string | null;
          purchase_price: number | null;
          qr_value: string | null;
          status: string;
          updated_at: string;
          useful_life_years: number | null;
          vendor_id: string | null;
          warranty_expiry: string | null;
        };
        Insert: {
          asset_code?: string | null;
          assigned_to_label?: string | null;
          assigned_to_profile_id?: string | null;
          barcode_value?: string | null;
          category?: string | null;
          category_id?: string | null;
          condition?: string;
          created_at?: string;
          current_value?: number | null;
          id?: string;
          invoice_ref?: string | null;
          location?: string | null;
          name: string;
          notes?: string | null;
          purchase_date?: string | null;
          purchase_price?: number | null;
          qr_value?: string | null;
          status?: string;
          updated_at?: string;
          useful_life_years?: number | null;
          vendor_id?: string | null;
          warranty_expiry?: string | null;
        };
        Update: {
          asset_code?: string | null;
          assigned_to_label?: string | null;
          assigned_to_profile_id?: string | null;
          barcode_value?: string | null;
          category?: string | null;
          category_id?: string | null;
          condition?: string;
          created_at?: string;
          current_value?: number | null;
          id?: string;
          invoice_ref?: string | null;
          location?: string | null;
          name?: string;
          notes?: string | null;
          purchase_date?: string | null;
          purchase_price?: number | null;
          qr_value?: string | null;
          status?: string;
          updated_at?: string;
          useful_life_years?: number | null;
          vendor_id?: string | null;
          warranty_expiry?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assets_assigned_to_profile_id_fkey";
            columns: ["assigned_to_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_assigned_to_profile_id_fkey";
            columns: ["assigned_to_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "asset_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "asset_vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance: {
        Row: {
          class_id: string | null;
          created_at: string;
          date: string;
          id: string;
          marked_by: string | null;
          note: string | null;
          status: Database["public"]["Enums"]["attendance_status"];
          student_id: string;
        };
        Insert: {
          class_id?: string | null;
          created_at?: string;
          date: string;
          id?: string;
          marked_by?: string | null;
          note?: string | null;
          status?: Database["public"]["Enums"]["attendance_status"];
          student_id: string;
        };
        Update: {
          class_id?: string | null;
          created_at?: string;
          date?: string;
          id?: string;
          marked_by?: string | null;
          note?: string | null;
          status?: Database["public"]["Enums"]["attendance_status"];
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_corrections: {
        Row: {
          attendance_id: string | null;
          changed_by: string;
          changed_by_role: string;
          created_at: string;
          date: string;
          from_check_in: string | null;
          from_status: string | null;
          id: string;
          reason: string;
          teacher_id: string;
          to_check_in: string | null;
          to_status: string;
        };
        Insert: {
          attendance_id?: string | null;
          changed_by: string;
          changed_by_role: string;
          created_at?: string;
          date: string;
          from_check_in?: string | null;
          from_status?: string | null;
          id?: string;
          reason: string;
          teacher_id: string;
          to_check_in?: string | null;
          to_status: string;
        };
        Update: {
          attendance_id?: string | null;
          changed_by?: string;
          changed_by_role?: string;
          created_at?: string;
          date?: string;
          from_check_in?: string | null;
          from_status?: string | null;
          id?: string;
          reason?: string;
          teacher_id?: string;
          to_check_in?: string | null;
          to_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_corrections_attendance_id_fkey";
            columns: ["attendance_id"];
            isOneToOne: false;
            referencedRelation: "teacher_attendance";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_corrections_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcast_recipients: {
        Row: {
          broadcast_id: string;
          created_at: string;
          id: string;
          read_at: string | null;
          user_id: string;
        };
        Insert: {
          broadcast_id: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          user_id: string;
        };
        Update: {
          broadcast_id?: string;
          created_at?: string;
          id?: string;
          read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey";
            columns: ["broadcast_id"];
            isOneToOne: false;
            referencedRelation: "broadcasts";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcasts: {
        Row: {
          attachment_url: string | null;
          audience_ref: string | null;
          audience_type: string;
          body: string;
          created_at: string;
          id: string;
          sender_id: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          attachment_url?: string | null;
          audience_ref?: string | null;
          audience_type: string;
          body: string;
          created_at?: string;
          id?: string;
          sender_id: string;
          subject: string;
          updated_at?: string;
        };
        Update: {
          attachment_url?: string | null;
          audience_ref?: string | null;
          audience_type?: string;
          body?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      bus_locations: {
        Row: {
          bus_id: string;
          id: string;
          lat: number;
          lng: number;
          recorded_at: string;
          speed: number | null;
        };
        Insert: {
          bus_id: string;
          id?: string;
          lat: number;
          lng: number;
          recorded_at?: string;
          speed?: number | null;
        };
        Update: {
          bus_id?: string;
          id?: string;
          lat?: number;
          lng?: number;
          recorded_at?: string;
          speed?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "bus_locations_bus_id_fkey";
            columns: ["bus_id"];
            isOneToOne: false;
            referencedRelation: "buses";
            referencedColumns: ["id"];
          },
        ];
      };
      buses: {
        Row: {
          capacity: number;
          created_at: string;
          driver_name: string | null;
          driver_phone: string | null;
          id: string;
          number: string;
          route_name: string | null;
          updated_at: string;
        };
        Insert: {
          capacity?: number;
          created_at?: string;
          driver_name?: string | null;
          driver_phone?: string | null;
          id?: string;
          number: string;
          route_name?: string | null;
          updated_at?: string;
        };
        Update: {
          capacity?: number;
          created_at?: string;
          driver_name?: string | null;
          driver_phone?: string | null;
          id?: string;
          number?: string;
          route_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      candidates: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          job_opening_id: string | null;
          name: string;
          notes: string | null;
          phone: string | null;
          rating: number | null;
          resume_url: string | null;
          source: string | null;
          stage: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          job_opening_id?: string | null;
          name: string;
          notes?: string | null;
          phone?: string | null;
          rating?: number | null;
          resume_url?: string | null;
          source?: string | null;
          stage?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          job_opening_id?: string | null;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          rating?: number | null;
          resume_url?: string | null;
          source?: string | null;
          stage?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidates_job_opening_id_fkey";
            columns: ["job_opening_id"];
            isOneToOne: false;
            referencedRelation: "job_openings";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: {
          academic_year: string;
          capacity: number | null;
          class_teacher_id: string | null;
          created_at: string;
          id: string;
          name: string;
          room: string | null;
          section: string | null;
        };
        Insert: {
          academic_year?: string;
          capacity?: number | null;
          class_teacher_id?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          room?: string | null;
          section?: string | null;
        };
        Update: {
          academic_year?: string;
          capacity?: number | null;
          class_teacher_id?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          room?: string | null;
          section?: string | null;
        };
        Relationships: [];
      };
      complaint_messages: {
        Row: {
          body: string;
          complaint_id: string;
          created_at: string;
          id: string;
          sender_id: string;
        };
        Insert: {
          body: string;
          complaint_id: string;
          created_at?: string;
          id?: string;
          sender_id: string;
        };
        Update: {
          body?: string;
          complaint_id?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "complaint_messages_complaint_id_fkey";
            columns: ["complaint_id"];
            isOneToOne: false;
            referencedRelation: "complaints";
            referencedColumns: ["id"];
          },
        ];
      };
      complaints: {
        Row: {
          body: string;
          created_at: string;
          escalated_to_admin: boolean;
          id: string;
          raised_by: string;
          severity: string;
          status: string;
          student_id: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          escalated_to_admin?: boolean;
          id?: string;
          raised_by: string;
          severity?: string;
          status?: string;
          student_id: string;
          subject: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          escalated_to_admin?: boolean;
          id?: string;
          raised_by?: string;
          severity?: string;
          status?: string;
          student_id?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "complaints_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: {
          budget: number | null;
          code: string;
          created_at: string;
          description: string | null;
          head_staff_id: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          budget?: number | null;
          code: string;
          created_at?: string;
          description?: string | null;
          head_staff_id?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          budget?: number | null;
          code?: string;
          created_at?: string;
          description?: string | null;
          head_staff_id?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "departments_head_staff_id_fkey";
            columns: ["head_staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      designations: {
        Row: {
          created_at: string;
          department_id: string | null;
          id: string;
          level: number | null;
          max_pay: number | null;
          min_pay: number | null;
          reports_to: string | null;
          salary_grade: string | null;
          title: string;
        };
        Insert: {
          created_at?: string;
          department_id?: string | null;
          id?: string;
          level?: number | null;
          max_pay?: number | null;
          min_pay?: number | null;
          reports_to?: string | null;
          salary_grade?: string | null;
          title: string;
        };
        Update: {
          created_at?: string;
          department_id?: string | null;
          id?: string;
          level?: number | null;
          max_pay?: number | null;
          min_pay?: number | null;
          reports_to?: string | null;
          salary_grade?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "designations_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "designations_reports_to_fkey";
            columns: ["reports_to"];
            isOneToOne: false;
            referencedRelation: "designations";
            referencedColumns: ["id"];
          },
        ];
      };
      driver_incidents: {
        Row: {
          created_at: string;
          description: string;
          driver_id: string;
          id: string;
          incident_date: string;
          incident_type: string;
          reported_by: string | null;
          resolution_notes: string | null;
          severity: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          driver_id: string;
          id?: string;
          incident_date?: string;
          incident_type: string;
          reported_by?: string | null;
          resolution_notes?: string | null;
          severity?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          driver_id?: string;
          id?: string;
          incident_date?: string;
          incident_type?: string;
          reported_by?: string | null;
          resolution_notes?: string | null;
          severity?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "driver_incidents_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      drivers: {
        Row: {
          assigned_vehicle_id: string | null;
          created_at: string;
          full_name: string;
          id: string;
          license_expiry: string | null;
          license_no: string;
          phone: string | null;
          updated_at: string;
          years_experience: number;
        };
        Insert: {
          assigned_vehicle_id?: string | null;
          created_at?: string;
          full_name: string;
          id?: string;
          license_expiry?: string | null;
          license_no: string;
          phone?: string | null;
          updated_at?: string;
          years_experience?: number;
        };
        Update: {
          assigned_vehicle_id?: string | null;
          created_at?: string;
          full_name?: string;
          id?: string;
          license_expiry?: string | null;
          license_no?: string;
          phone?: string | null;
          updated_at?: string;
          years_experience?: number;
        };
        Relationships: [
          {
            foreignKeyName: "drivers_assigned_vehicle_id_fkey";
            columns: ["assigned_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "fleet_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_results: {
        Row: {
          created_at: string;
          exam_id: string;
          grade: string | null;
          id: string;
          marks_obtained: number;
          remarks: string | null;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          exam_id: string;
          grade?: string | null;
          id?: string;
          marks_obtained?: number;
          remarks?: string | null;
          student_id: string;
        };
        Update: {
          created_at?: string;
          exam_id?: string;
          grade?: string | null;
          id?: string;
          marks_obtained?: number;
          remarks?: string | null;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_results_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_results_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      exams: {
        Row: {
          class_id: string | null;
          created_at: string;
          exam_date: string | null;
          id: string;
          max_marks: number;
          name: string;
          subject_id: string | null;
          term: string | null;
        };
        Insert: {
          class_id?: string | null;
          created_at?: string;
          exam_date?: string | null;
          id?: string;
          max_marks?: number;
          name: string;
          subject_id?: string | null;
          term?: string | null;
        };
        Update: {
          class_id?: string | null;
          created_at?: string;
          exam_date?: string | null;
          id?: string;
          max_marks?: number;
          name?: string;
          subject_id?: string | null;
          term?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "exams_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exams_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_claims: {
        Row: {
          amount: number;
          approver_id: string | null;
          category: string;
          claim_date: string;
          created_at: string;
          id: string;
          notes: string | null;
          receipt_url: string | null;
          staff_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount?: number;
          approver_id?: string | null;
          category: string;
          claim_date?: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          receipt_url?: string | null;
          staff_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          approver_id?: string | null;
          category?: string;
          claim_date?: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          receipt_url?: string | null;
          staff_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_claims_approver_id_fkey";
            columns: ["approver_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_claims_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          amount: number;
          approval_status: string;
          category: string;
          created_at: string;
          created_by: string | null;
          expense_date: string;
          id: string;
          notes: string | null;
          updated_at: string;
          vendor: string | null;
        };
        Insert: {
          amount: number;
          approval_status?: string;
          category: string;
          created_at?: string;
          created_by?: string | null;
          expense_date: string;
          id?: string;
          notes?: string | null;
          updated_at?: string;
          vendor?: string | null;
        };
        Update: {
          amount?: number;
          approval_status?: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          expense_date?: string;
          id?: string;
          notes?: string | null;
          updated_at?: string;
          vendor?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles_public";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_assignments: {
        Row: {
          amount_due: number;
          amount_paid: number;
          created_at: string;
          due_date: string;
          id: string;
          status: Database["public"]["Enums"]["fee_status"];
          structure_id: string | null;
          student_id: string;
          title: string;
        };
        Insert: {
          amount_due: number;
          amount_paid?: number;
          created_at?: string;
          due_date: string;
          id?: string;
          status?: Database["public"]["Enums"]["fee_status"];
          structure_id?: string | null;
          student_id: string;
          title: string;
        };
        Update: {
          amount_due?: number;
          amount_paid?: number;
          created_at?: string;
          due_date?: string;
          id?: string;
          status?: Database["public"]["Enums"]["fee_status"];
          structure_id?: string | null;
          student_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fee_assignments_structure_id_fkey";
            columns: ["structure_id"];
            isOneToOne: false;
            referencedRelation: "fee_structures";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fee_assignments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_structures: {
        Row: {
          academic_year: string;
          amount: number;
          class_id: string | null;
          created_at: string;
          frequency: Database["public"]["Enums"]["fee_frequency"];
          id: string;
          name: string;
          term: string | null;
        };
        Insert: {
          academic_year?: string;
          amount: number;
          class_id?: string | null;
          created_at?: string;
          frequency?: Database["public"]["Enums"]["fee_frequency"];
          id?: string;
          name: string;
          term?: string | null;
        };
        Update: {
          academic_year?: string;
          amount?: number;
          class_id?: string | null;
          created_at?: string;
          frequency?: Database["public"]["Enums"]["fee_frequency"];
          id?: string;
          name?: string;
          term?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fee_structures_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
        ];
      };
      fleet_vehicles: {
        Row: {
          capacity: number;
          created_at: string;
          id: string;
          insurance_expiry: string | null;
          model: string | null;
          permit_expiry: string | null;
          purchase_date: string | null;
          registration_no: string;
          status: string;
          updated_at: string;
          vehicle_type: string;
        };
        Insert: {
          capacity?: number;
          created_at?: string;
          id?: string;
          insurance_expiry?: string | null;
          model?: string | null;
          permit_expiry?: string | null;
          purchase_date?: string | null;
          registration_no: string;
          status?: string;
          updated_at?: string;
          vehicle_type?: string;
        };
        Update: {
          capacity?: number;
          created_at?: string;
          id?: string;
          insurance_expiry?: string | null;
          model?: string | null;
          permit_expiry?: string | null;
          purchase_date?: string | null;
          registration_no?: string;
          status?: string;
          updated_at?: string;
          vehicle_type?: string;
        };
        Relationships: [];
      };
      fuel_logs: {
        Row: {
          cost: number;
          created_at: string;
          date: string;
          id: string;
          liters: number;
          odometer: number | null;
          updated_at: string;
          vehicle_id: string;
        };
        Insert: {
          cost: number;
          created_at?: string;
          date: string;
          id?: string;
          liters: number;
          odometer?: number | null;
          updated_at?: string;
          vehicle_id: string;
        };
        Update: {
          cost?: number;
          created_at?: string;
          date?: string;
          id?: string;
          liters?: number;
          odometer?: number | null;
          updated_at?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "fleet_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      grievances: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          resolved_at: string | null;
          response: string | null;
          staff_id: string;
          status: string;
          subject: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          resolved_at?: string | null;
          response?: string | null;
          staff_id: string;
          status?: string;
          subject: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          resolved_at?: string | null;
          response?: string | null;
          staff_id?: string;
          status?: string;
          subject?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grievances_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      holidays: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          end_date: string;
          id: string;
          name: string;
          start_date: string;
          type: Database["public"]["Enums"]["holiday_type"];
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          end_date: string;
          id?: string;
          name: string;
          start_date: string;
          type?: Database["public"]["Enums"]["holiday_type"];
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          end_date?: string;
          id?: string;
          name?: string;
          start_date?: string;
          type?: Database["public"]["Enums"]["holiday_type"];
        };
        Relationships: [];
      };
      homework: {
        Row: {
          assigned_date: string;
          attachment_type: string | null;
          attachment_url: string | null;
          class_id: string;
          created_at: string;
          description: string | null;
          due_date: string;
          id: string;
          max_marks: number | null;
          priority: string;
          status: string;
          subject_id: string | null;
          teacher_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          assigned_date?: string;
          attachment_type?: string | null;
          attachment_url?: string | null;
          class_id: string;
          created_at?: string;
          description?: string | null;
          due_date: string;
          id?: string;
          max_marks?: number | null;
          priority?: string;
          status?: string;
          subject_id?: string | null;
          teacher_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          assigned_date?: string;
          attachment_type?: string | null;
          attachment_url?: string | null;
          class_id?: string;
          created_at?: string;
          description?: string | null;
          due_date?: string;
          id?: string;
          max_marks?: number | null;
          priority?: string;
          status?: string;
          subject_id?: string | null;
          teacher_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "homework_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "homework_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      homework_submissions: {
        Row: {
          attachment_url: string | null;
          created_at: string;
          homework_id: string;
          id: string;
          marks: number | null;
          note: string | null;
          remarks: string | null;
          reviewed_at: string | null;
          status: string;
          student_id: string;
          submitted_at: string | null;
          updated_at: string;
        };
        Insert: {
          attachment_url?: string | null;
          created_at?: string;
          homework_id: string;
          id?: string;
          marks?: number | null;
          note?: string | null;
          remarks?: string | null;
          reviewed_at?: string | null;
          status?: string;
          student_id: string;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          attachment_url?: string | null;
          created_at?: string;
          homework_id?: string;
          id?: string;
          marks?: number | null;
          note?: string | null;
          remarks?: string | null;
          reviewed_at?: string | null;
          status?: string;
          student_id?: string;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "homework_submissions_homework_id_fkey";
            columns: ["homework_id"];
            isOneToOne: false;
            referencedRelation: "homework";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "homework_submissions_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      job_openings: {
        Row: {
          closes_at: string | null;
          created_at: string;
          department: string | null;
          description: string | null;
          id: string;
          opened_at: string | null;
          positions: number | null;
          status: string;
          title: string;
        };
        Insert: {
          closes_at?: string | null;
          created_at?: string;
          department?: string | null;
          description?: string | null;
          id?: string;
          opened_at?: string | null;
          positions?: number | null;
          status?: string;
          title: string;
        };
        Update: {
          closes_at?: string | null;
          created_at?: string;
          department?: string | null;
          description?: string | null;
          id?: string;
          opened_at?: string | null;
          positions?: number | null;
          status?: string;
          title?: string;
        };
        Relationships: [];
      };
      leave_balances: {
        Row: {
          allotted: number;
          created_at: string;
          id: string;
          leave_type: string;
          staff_id: string;
          updated_at: string;
          used: number;
          year: number;
        };
        Insert: {
          allotted?: number;
          created_at?: string;
          id?: string;
          leave_type: string;
          staff_id: string;
          updated_at?: string;
          used?: number;
          year: number;
        };
        Update: {
          allotted?: number;
          created_at?: string;
          id?: string;
          leave_type?: string;
          staff_id?: string;
          updated_at?: string;
          used?: number;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "leave_balances_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      leave_requests: {
        Row: {
          approver_comment: string | null;
          approver_id: string | null;
          created_at: string;
          days: number;
          decided_at: string | null;
          end_date: string;
          id: string;
          leave_type: string;
          reason: string | null;
          staff_id: string;
          start_date: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          approver_comment?: string | null;
          approver_id?: string | null;
          created_at?: string;
          days: number;
          decided_at?: string | null;
          end_date: string;
          id?: string;
          leave_type: string;
          reason?: string | null;
          staff_id: string;
          start_date: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          approver_comment?: string | null;
          approver_id?: string | null;
          created_at?: string;
          days?: number;
          decided_at?: string | null;
          end_date?: string;
          id?: string;
          leave_type?: string;
          reason?: string | null;
          staff_id?: string;
          start_date?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leave_requests_approver_id_fkey";
            columns: ["approver_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leave_requests_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      library_books: {
        Row: {
          author: string | null;
          available_copies: number;
          category: string | null;
          created_at: string;
          id: string;
          isbn: string | null;
          title: string;
          total_copies: number;
          updated_at: string;
        };
        Insert: {
          author?: string | null;
          available_copies?: number;
          category?: string | null;
          created_at?: string;
          id?: string;
          isbn?: string | null;
          title: string;
          total_copies?: number;
          updated_at?: string;
        };
        Update: {
          author?: string | null;
          available_copies?: number;
          category?: string | null;
          created_at?: string;
          id?: string;
          isbn?: string | null;
          title?: string;
          total_copies?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      library_loans: {
        Row: {
          book_id: string;
          borrower_type: string;
          created_at: string;
          due_at: string;
          fine_amount: number;
          fine_settled_at: string | null;
          fine_status: string;
          id: string;
          issued_at: string;
          notes: string | null;
          returned_at: string | null;
          student_id: string | null;
          teacher_id: string | null;
          updated_at: string;
        };
        Insert: {
          book_id: string;
          borrower_type?: string;
          created_at?: string;
          due_at: string;
          fine_amount?: number;
          fine_settled_at?: string | null;
          fine_status?: string;
          id?: string;
          issued_at?: string;
          notes?: string | null;
          returned_at?: string | null;
          student_id?: string | null;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Update: {
          book_id?: string;
          borrower_type?: string;
          created_at?: string;
          due_at?: string;
          fine_amount?: number;
          fine_settled_at?: string | null;
          fine_status?: string;
          id?: string;
          issued_at?: string;
          notes?: string | null;
          returned_at?: string | null;
          student_id?: string | null;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "library_loans_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "library_books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_loans_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_loans_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      overtime_requests: {
        Row: {
          approver_id: string | null;
          created_at: string;
          hours: number;
          id: string;
          notes: string | null;
          rate_multiplier: number;
          staff_id: string;
          status: string;
          work_date: string;
        };
        Insert: {
          approver_id?: string | null;
          created_at?: string;
          hours?: number;
          id?: string;
          notes?: string | null;
          rate_multiplier?: number;
          staff_id: string;
          status?: string;
          work_date: string;
        };
        Update: {
          approver_id?: string | null;
          created_at?: string;
          hours?: number;
          id?: string;
          notes?: string | null;
          rate_multiplier?: number;
          staff_id?: string;
          status?: string;
          work_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "overtime_requests_approver_id_fkey";
            columns: ["approver_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "overtime_requests_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      parent_student: {
        Row: {
          id: string;
          parent_id: string;
          relationship: string | null;
          student_id: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          relationship?: string | null;
          student_id: string;
        };
        Update: {
          id?: string;
          parent_id?: string;
          relationship?: string | null;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parent_student_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_student_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "profiles_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_student_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_reconciliations: {
        Row: {
          bank_ref: string | null;
          id: string;
          payment_id: string;
          reconciled_at: string;
          reconciled_by: string | null;
        };
        Insert: {
          bank_ref?: string | null;
          id?: string;
          payment_id: string;
          reconciled_at?: string;
          reconciled_by?: string | null;
        };
        Update: {
          bank_ref?: string | null;
          id?: string;
          payment_id?: string;
          reconciled_at?: string;
          reconciled_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payment_reconciliations_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: true;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_reconciliations_reconciled_by_fkey";
            columns: ["reconciled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_reconciliations_reconciled_by_fkey";
            columns: ["reconciled_by"];
            isOneToOne: false;
            referencedRelation: "profiles_public";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          fee_assignment_id: string;
          id: string;
          method: string;
          notes: string | null;
          paid_at: string;
          receipt_no: string;
          recorded_by: string | null;
          reference: string | null;
          status: Database["public"]["Enums"]["payment_status"];
          student_id: string;
        };
        Insert: {
          amount: number;
          fee_assignment_id: string;
          id?: string;
          method?: string;
          notes?: string | null;
          paid_at?: string;
          receipt_no?: string;
          recorded_by?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          student_id: string;
        };
        Update: {
          amount?: number;
          fee_assignment_id?: string;
          id?: string;
          method?: string;
          notes?: string | null;
          paid_at?: string;
          receipt_no?: string;
          recorded_by?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_fee_assignment_id_fkey";
            columns: ["fee_assignment_id"];
            isOneToOne: false;
            referencedRelation: "fee_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_runs: {
        Row: {
          allowances: number;
          base_salary: number;
          created_at: string;
          deductions: number;
          id: string;
          month: string;
          net_salary: number;
          notes: string | null;
          pay_date: string | null;
          staff_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          allowances?: number;
          base_salary?: number;
          created_at?: string;
          deductions?: number;
          id?: string;
          month: string;
          net_salary?: number;
          notes?: string | null;
          pay_date?: string | null;
          staff_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          allowances?: number;
          base_salary?: number;
          created_at?: string;
          deductions?: number;
          id?: string;
          month?: string;
          net_salary?: number;
          notes?: string | null;
          pay_date?: string | null;
          staff_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payroll_runs_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      permission_audit_log: {
        Row: {
          actor_id: string;
          created_at: string;
          id: string;
          new_value: boolean;
          old_value: boolean | null;
          permission_key: string;
          target_user_id: string;
        };
        Insert: {
          actor_id: string;
          created_at?: string;
          id?: string;
          new_value: boolean;
          old_value?: boolean | null;
          permission_key: string;
          target_user_id: string;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          id?: string;
          new_value?: boolean;
          old_value?: boolean | null;
          permission_key?: string;
          target_user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      progress_notes: {
        Row: {
          created_at: string;
          id: string;
          note: string;
          note_date: string;
          student_id: string;
          teacher_id: string;
          tone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          note: string;
          note_date?: string;
          student_id: string;
          teacher_id: string;
          tone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string;
          note_date?: string;
          student_id?: string;
          teacher_id?: string;
          tone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "progress_notes_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      resignations: {
        Row: {
          clearance: Json | null;
          created_at: string;
          exit_interview: Json | null;
          final_settlement_amount: number | null;
          hr_status: string;
          id: string;
          last_working_day: string;
          manager_status: string;
          reason: string | null;
          staff_id: string;
          status: string;
          submitted_at: string;
          updated_at: string;
        };
        Insert: {
          clearance?: Json | null;
          created_at?: string;
          exit_interview?: Json | null;
          final_settlement_amount?: number | null;
          hr_status?: string;
          id?: string;
          last_working_day: string;
          manager_status?: string;
          reason?: string | null;
          staff_id: string;
          status?: string;
          submitted_at?: string;
          updated_at?: string;
        };
        Update: {
          clearance?: Json | null;
          created_at?: string;
          exit_interview?: Json | null;
          final_settlement_amount?: number | null;
          hr_status?: string;
          id?: string;
          last_working_day?: string;
          manager_status?: string;
          reason?: string | null;
          staff_id?: string;
          status?: string;
          submitted_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resignations_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      route_stops: {
        Row: {
          created_at: string;
          estimated_minutes: number;
          eta: string | null;
          id: string;
          name: string;
          route_id: string;
          sequence: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          estimated_minutes?: number;
          eta?: string | null;
          id?: string;
          name: string;
          route_id: string;
          sequence?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          estimated_minutes?: number;
          eta?: string | null;
          id?: string;
          name?: string;
          route_id?: string;
          sequence?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "route_stops_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "transport_routes";
            referencedColumns: ["id"];
          },
        ];
      };
      route_students: {
        Row: {
          created_at: string;
          drop_time: string | null;
          id: string;
          pickup_time: string | null;
          route_id: string;
          stop_id: string | null;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          drop_time?: string | null;
          id?: string;
          pickup_time?: string | null;
          route_id: string;
          stop_id?: string | null;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          drop_time?: string | null;
          id?: string;
          pickup_time?: string | null;
          route_id?: string;
          stop_id?: string | null;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "route_students_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "transport_routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "route_students_stop_id_fkey";
            columns: ["stop_id"];
            isOneToOne: false;
            referencedRelation: "route_stops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "route_students_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      salary_structures: {
        Row: {
          allowances: Json;
          base_pay: number;
          created_at: string;
          designation: string;
          id: string;
          standard_deductions: Json;
          updated_at: string;
        };
        Insert: {
          allowances?: Json;
          base_pay?: number;
          created_at?: string;
          designation: string;
          id?: string;
          standard_deductions?: Json;
          updated_at?: string;
        };
        Update: {
          allowances?: Json;
          base_pay?: number;
          created_at?: string;
          designation?: string;
          id?: string;
          standard_deductions?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      shifts: {
        Row: {
          created_at: string;
          end_time: string;
          id: string;
          name: string;
          shift_type: string;
          start_time: string;
          weekly_off: string[] | null;
        };
        Insert: {
          created_at?: string;
          end_time: string;
          id?: string;
          name: string;
          shift_type?: string;
          start_time: string;
          weekly_off?: string[] | null;
        };
        Update: {
          created_at?: string;
          end_time?: string;
          id?: string;
          name?: string;
          shift_type?: string;
          start_time?: string;
          weekly_off?: string[] | null;
        };
        Relationships: [];
      };
      staff: {
        Row: {
          address: string | null;
          background_verification: Json | null;
          bank_details: Json | null;
          blood_group: string | null;
          confirmation_status: string;
          created_at: string;
          department: string;
          designation: string;
          dob: string | null;
          email: string | null;
          emergency_contact: Json | null;
          employee_code: string;
          employment_type: string;
          exit_status: string | null;
          experience_years: number | null;
          full_name: string;
          id: string;
          join_date: string;
          medical_info: Json | null;
          phone: string | null;
          photo_url: string | null;
          probation_end_date: string | null;
          profile_id: string | null;
          qualifications: Json | null;
          reporting_manager_id: string | null;
          skills: string[] | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          background_verification?: Json | null;
          bank_details?: Json | null;
          blood_group?: string | null;
          confirmation_status?: string;
          created_at?: string;
          department: string;
          designation: string;
          dob?: string | null;
          email?: string | null;
          emergency_contact?: Json | null;
          employee_code: string;
          employment_type?: string;
          exit_status?: string | null;
          experience_years?: number | null;
          full_name: string;
          id?: string;
          join_date?: string;
          medical_info?: Json | null;
          phone?: string | null;
          photo_url?: string | null;
          probation_end_date?: string | null;
          profile_id?: string | null;
          qualifications?: Json | null;
          reporting_manager_id?: string | null;
          skills?: string[] | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          background_verification?: Json | null;
          bank_details?: Json | null;
          blood_group?: string | null;
          confirmation_status?: string;
          created_at?: string;
          department?: string;
          designation?: string;
          dob?: string | null;
          email?: string | null;
          emergency_contact?: Json | null;
          employee_code?: string;
          employment_type?: string;
          exit_status?: string | null;
          experience_years?: number | null;
          full_name?: string;
          id?: string;
          join_date?: string;
          medical_info?: Json | null;
          phone?: string | null;
          photo_url?: string | null;
          probation_end_date?: string | null;
          profile_id?: string | null;
          qualifications?: Json | null;
          reporting_manager_id?: string | null;
          skills?: string[] | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_reporting_manager_id_fkey";
            columns: ["reporting_manager_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_documents: {
        Row: {
          created_at: string;
          doc_type: string;
          expiry_date: string | null;
          file_url: string | null;
          id: string;
          staff_id: string;
          title: string;
          updated_at: string;
          uploaded_at: string;
        };
        Insert: {
          created_at?: string;
          doc_type: string;
          expiry_date?: string | null;
          file_url?: string | null;
          id?: string;
          staff_id: string;
          title: string;
          updated_at?: string;
          uploaded_at?: string;
        };
        Update: {
          created_at?: string;
          doc_type?: string;
          expiry_date?: string | null;
          file_url?: string | null;
          id?: string;
          staff_id?: string;
          title?: string;
          updated_at?: string;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_documents_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_employment_history: {
        Row: {
          created_at: string;
          effective_date: string;
          event_type: string;
          from_value: string | null;
          id: string;
          notes: string | null;
          staff_id: string;
          to_value: string | null;
        };
        Insert: {
          created_at?: string;
          effective_date: string;
          event_type: string;
          from_value?: string | null;
          id?: string;
          notes?: string | null;
          staff_id: string;
          to_value?: string | null;
        };
        Update: {
          created_at?: string;
          effective_date?: string;
          event_type?: string;
          from_value?: string | null;
          id?: string;
          notes?: string | null;
          staff_id?: string;
          to_value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "staff_employment_history_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_permissions: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          permission_key: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          permission_key: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          permission_key?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      staff_shifts: {
        Row: {
          created_at: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          shift_id: string;
          staff_id: string;
        };
        Insert: {
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          shift_id: string;
          staff_id: string;
        };
        Update: {
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          shift_id?: string;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_shifts_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_shifts_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      students: {
        Row: {
          admission_date: string;
          admission_no: string | null;
          class_id: string | null;
          created_at: string;
          gender: string | null;
          id: string;
          profile_id: string;
          roll_no: string | null;
          status: Database["public"]["Enums"]["student_status"];
        };
        Insert: {
          admission_date?: string;
          admission_no?: string | null;
          class_id?: string | null;
          created_at?: string;
          gender?: string | null;
          id?: string;
          profile_id: string;
          roll_no?: string | null;
          status?: Database["public"]["Enums"]["student_status"];
        };
        Update: {
          admission_date?: string;
          admission_no?: string | null;
          class_id?: string | null;
          created_at?: string;
          gender?: string | null;
          id?: string;
          profile_id?: string;
          roll_no?: string | null;
          status?: Database["public"]["Enums"]["student_status"];
        };
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles_public";
            referencedColumns: ["id"];
          },
        ];
      };
      subjects: {
        Row: {
          class_id: string | null;
          code: string | null;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          class_id?: string | null;
          code?: string | null;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          class_id?: string | null;
          code?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subjects_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_attendance: {
        Row: {
          check_in_time: string | null;
          correction_reason: string | null;
          created_at: string;
          date: string;
          id: string;
          marked_by: string;
          marked_by_user: string | null;
          notes: string | null;
          status: string;
          teacher_id: string;
          updated_at: string;
        };
        Insert: {
          check_in_time?: string | null;
          correction_reason?: string | null;
          created_at?: string;
          date: string;
          id?: string;
          marked_by?: string;
          marked_by_user?: string | null;
          notes?: string | null;
          status?: string;
          teacher_id: string;
          updated_at?: string;
        };
        Update: {
          check_in_time?: string | null;
          correction_reason?: string | null;
          created_at?: string;
          date?: string;
          id?: string;
          marked_by?: string;
          marked_by_user?: string | null;
          notes?: string | null;
          status?: string;
          teacher_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_attendance_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_classes: {
        Row: {
          class_id: string;
          created_at: string;
          id: string;
          teacher_id: string;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          id?: string;
          teacher_id: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          id?: string;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_classes_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_experience: {
        Row: {
          created_at: string;
          employer: string;
          end_date: string | null;
          id: string;
          role: string | null;
          start_date: string | null;
          teacher_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          employer: string;
          end_date?: string | null;
          id?: string;
          role?: string | null;
          start_date?: string | null;
          teacher_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          employer?: string;
          end_date?: string | null;
          id?: string;
          role?: string | null;
          start_date?: string | null;
          teacher_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_experience_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_performance_reviews: {
        Row: {
          created_at: string;
          id: string;
          notes: string | null;
          period: string;
          rating: number;
          reviewer_id: string | null;
          teacher_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          period: string;
          rating: number;
          reviewer_id?: string | null;
          teacher_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          period?: string;
          rating?: number;
          reviewer_id?: string | null;
          teacher_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_performance_reviews_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_performance_reviews_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles_public";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_performance_reviews_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_qualifications: {
        Row: {
          certification: string | null;
          created_at: string;
          degree: string;
          id: string;
          institution: string | null;
          teacher_id: string;
          updated_at: string;
          year: number | null;
        };
        Insert: {
          certification?: string | null;
          created_at?: string;
          degree: string;
          id?: string;
          institution?: string | null;
          teacher_id: string;
          updated_at?: string;
          year?: number | null;
        };
        Update: {
          certification?: string | null;
          created_at?: string;
          degree?: string;
          id?: string;
          institution?: string | null;
          teacher_id?: string;
          updated_at?: string;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_qualifications_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      teachers: {
        Row: {
          created_at: string;
          email: string;
          experience_years: number;
          full_name: string;
          id: string;
          joined_date: string;
          phone: string | null;
          qualification: string | null;
          staff_id: string | null;
          status: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          experience_years?: number;
          full_name: string;
          id?: string;
          joined_date?: string;
          phone?: string | null;
          qualification?: string | null;
          staff_id?: string | null;
          status?: string;
          subject: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          experience_years?: number;
          full_name?: string;
          id?: string;
          joined_date?: string;
          phone?: string | null;
          qualification?: string | null;
          staff_id?: string | null;
          status?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teachers_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      timetable: {
        Row: {
          class_id: string;
          created_at: string;
          day_of_week: number;
          end_time: string;
          id: string;
          room: string | null;
          start_time: string;
          subject_id: string | null;
          teacher_id: string | null;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          day_of_week: number;
          end_time: string;
          id?: string;
          room?: string | null;
          start_time: string;
          subject_id?: string | null;
          teacher_id?: string | null;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          day_of_week?: number;
          end_time?: string;
          id?: string;
          room?: string | null;
          start_time?: string;
          subject_id?: string | null;
          teacher_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "timetable_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timetable_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      training_attendance: {
        Row: {
          attended: boolean | null;
          created_at: string;
          feedback: string | null;
          id: string;
          program_id: string;
          rating: number | null;
          staff_id: string;
        };
        Insert: {
          attended?: boolean | null;
          created_at?: string;
          feedback?: string | null;
          id?: string;
          program_id: string;
          rating?: number | null;
          staff_id: string;
        };
        Update: {
          attended?: boolean | null;
          created_at?: string;
          feedback?: string | null;
          id?: string;
          program_id?: string;
          rating?: number | null;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_attendance_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "training_programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_attendance_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      training_programs: {
        Row: {
          cost: number | null;
          created_at: string;
          description: string | null;
          end_date: string | null;
          id: string;
          program_type: string;
          provider: string | null;
          skill_tags: string[] | null;
          start_date: string | null;
          title: string;
        };
        Insert: {
          cost?: number | null;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          program_type?: string;
          provider?: string | null;
          skill_tags?: string[] | null;
          start_date?: string | null;
          title: string;
        };
        Update: {
          cost?: number | null;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          program_type?: string;
          provider?: string | null;
          skill_tags?: string[] | null;
          start_date?: string | null;
          title?: string;
        };
        Relationships: [];
      };
      transport_routes: {
        Row: {
          created_at: string;
          driver_id: string | null;
          id: string;
          name: string;
          notes: string | null;
          updated_at: string;
          vehicle_id: string | null;
        };
        Insert: {
          created_at?: string;
          driver_id?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Update: {
          created_at?: string;
          driver_id?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transport_routes_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transport_routes_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "fleet_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      travel_requests: {
        Row: {
          advance_amount: number | null;
          created_at: string;
          destination: string;
          end_date: string;
          id: string;
          purpose: string | null;
          settled_at: string | null;
          settlement_amount: number | null;
          staff_id: string;
          start_date: string;
          status: string;
        };
        Insert: {
          advance_amount?: number | null;
          created_at?: string;
          destination: string;
          end_date: string;
          id?: string;
          purpose?: string | null;
          settled_at?: string | null;
          settlement_amount?: number | null;
          staff_id: string;
          start_date: string;
          status?: string;
        };
        Update: {
          advance_amount?: number | null;
          created_at?: string;
          destination?: string;
          end_date?: string;
          id?: string;
          purpose?: string | null;
          settled_at?: string | null;
          settlement_amount?: number | null;
          staff_id?: string;
          start_date?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "travel_requests_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      vehicle_documents: {
        Row: {
          created_at: string;
          doc_kind: string;
          expiry_date: string | null;
          file_path: string | null;
          id: string;
          issue_date: string | null;
          notes: string | null;
          title: string;
          updated_at: string;
          uploaded_by: string | null;
          vehicle_id: string;
        };
        Insert: {
          created_at?: string;
          doc_kind: string;
          expiry_date?: string | null;
          file_path?: string | null;
          id?: string;
          issue_date?: string | null;
          notes?: string | null;
          title: string;
          updated_at?: string;
          uploaded_by?: string | null;
          vehicle_id: string;
        };
        Update: {
          created_at?: string;
          doc_kind?: string;
          expiry_date?: string | null;
          file_path?: string | null;
          id?: string;
          issue_date?: string | null;
          notes?: string | null;
          title?: string;
          updated_at?: string;
          uploaded_by?: string | null;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_documents_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "fleet_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_maintenance: {
        Row: {
          cost: number;
          created_at: string;
          id: string;
          next_due_date: string | null;
          notes: string | null;
          service_date: string;
          service_type: string;
          updated_at: string;
          vehicle_id: string;
          vendor: string | null;
        };
        Insert: {
          cost?: number;
          created_at?: string;
          id?: string;
          next_due_date?: string | null;
          notes?: string | null;
          service_date: string;
          service_type: string;
          updated_at?: string;
          vehicle_id: string;
          vendor?: string | null;
        };
        Update: {
          cost?: number;
          created_at?: string;
          id?: string;
          next_due_date?: string | null;
          notes?: string | null;
          service_date?: string;
          service_type?: string;
          updated_at?: string;
          vehicle_id?: string;
          vendor?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "fleet_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_positions: {
        Row: {
          gps_connected: boolean;
          id: string;
          lat: number;
          lng: number;
          updated_at: string;
          vehicle_id: string;
        };
        Insert: {
          gps_connected?: boolean;
          id?: string;
          lat: number;
          lng: number;
          updated_at?: string;
          vehicle_id: string;
        };
        Update: {
          gps_connected?: boolean;
          id?: string;
          lat?: number;
          lng?: number;
          updated_at?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_positions_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: true;
            referencedRelation: "fleet_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      visitor_logs: {
        Row: {
          check_in: string;
          check_out: string | null;
          created_at: string;
          department: string | null;
          id: string;
          id_reference: string | null;
          meeting_person: string | null;
          name: string;
          photo_url: string | null;
          purpose: string;
          updated_at: string;
        };
        Insert: {
          check_in?: string;
          check_out?: string | null;
          created_at?: string;
          department?: string | null;
          id?: string;
          id_reference?: string | null;
          meeting_person?: string | null;
          name: string;
          photo_url?: string | null;
          purpose: string;
          updated_at?: string;
        };
        Update: {
          check_in?: string;
          check_out?: string | null;
          created_at?: string;
          department?: string | null;
          id?: string;
          id_reference?: string | null;
          meeting_person?: string | null;
          name?: string;
          photo_url?: string | null;
          purpose?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      profiles_public: {
        Row: {
          avatar_url: string | null;
          full_name: string | null;
          id: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          full_name?: string | null;
          id?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          full_name?: string | null;
          id?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      find_duplicate_students: {
        Args: never;
        Returns: {
          count: number;
          full_name: string;
          student_ids: string[];
        }[];
      };
      fleet_renewals_due: {
        Args: { _days?: number };
        Returns: {
          days_left: number;
          expiry_date: string;
          kind: string;
          label: string;
          ref_id: string;
        }[];
      };
      get_class_stats: {
        Args: { _class_ids: string[] };
        Returns: {
          attendance_present: number;
          attendance_total: number;
          class_id: string;
          student_count: number;
        }[];
      };
      get_user_primary_role: {
        Args: { _user_id: string };
        Returns: Database["public"]["Enums"]["app_role"];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_parent_of_student: { Args: { _student_id: string }; Returns: boolean };
      is_teacher_of_class: { Args: { _class_id: string }; Returns: boolean };
      is_teacher_of_student: { Args: { _student_id: string }; Returns: boolean };
      next_admission_no: { Args: never; Returns: string };
      promote_students: {
        Args: { p_exclude?: string[]; p_from_class: string; p_to_class: string };
        Returns: number;
      };
      search_students: {
        Args: {
          p_class_id?: string;
          p_dir?: string;
          p_from_date?: string;
          p_gender?: string;
          p_grade_name?: string;
          p_limit?: number;
          p_offset?: number;
          p_q?: string;
          p_section?: string;
          p_sort?: string;
          p_status?: Database["public"]["Enums"]["student_status"];
          p_to_date?: string;
        };
        Returns: {
          admission_date: string;
          admission_no: string;
          class_id: string;
          class_name: string;
          class_section: string;
          email: string;
          full_name: string;
          gender: string;
          id: string;
          profile_id: string;
          roll_no: string;
          status: Database["public"]["Enums"]["student_status"];
          total_count: number;
        }[];
      };
    };
    Enums: {
      announcement_audience: "all" | "admins" | "teachers" | "students" | "parents" | "class";
      app_role:
        | "admin"
        | "teacher"
        | "student"
        | "parent"
        | "hr"
        | "accountant"
        | "reception"
        | "fleet_manager";
      attendance_status: "present" | "absent" | "late" | "excused";
      fee_frequency: "one_time" | "monthly" | "quarterly";
      fee_status: "pending" | "paid" | "overdue" | "partial";
      holiday_type: "holiday" | "vacation" | "exam" | "event";
      payment_status: "pending" | "successful" | "failed" | "refunded";
      student_status: "active" | "inactive" | "alumni";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      announcement_audience: ["all", "admins", "teachers", "students", "parents", "class"],
      app_role: [
        "admin",
        "teacher",
        "student",
        "parent",
        "hr",
        "accountant",
        "reception",
        "fleet_manager",
      ],
      attendance_status: ["present", "absent", "late", "excused"],
      fee_frequency: ["one_time", "monthly", "quarterly"],
      fee_status: ["pending", "paid", "overdue", "partial"],
      holiday_type: ["holiday", "vacation", "exam", "event"],
      payment_status: ["pending", "successful", "failed", "refunded"],
      student_status: ["active", "inactive", "alumni"],
    },
  },
} as const;
