-- Migração inicial: espelha os modelos do Django (app booking) no PostgreSQL do Supabase.

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(150) NOT NULL,
    "email" VARCHAR(254) NOT NULL DEFAULT '',
    "first_name" VARCHAR(150) NOT NULL DEFAULT '',
    "password_hash" VARCHAR(255) NOT NULL,
    "is_superuser" BOOLEAN NOT NULL DEFAULT false,
    "is_staff" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "date_joined" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "category" VARCHAR(60) NOT NULL DEFAULT '',
    "city" VARCHAR(80) NOT NULL DEFAULT '',
    "search_text" TEXT NOT NULL DEFAULT '',
    "description" VARCHAR(255) NOT NULL DEFAULT '',
    "address" VARCHAR(255) NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "logo_path" VARCHAR(255),
    "notify_customers" BOOLEAN NOT NULL DEFAULT true,
    "notify_admins" BOOLEAN NOT NULL DEFAULT true,
    "min_notice_hours" INTEGER NOT NULL DEFAULT 0,
    "cancel_notice_hours" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "max_companies_per_user" INTEGER NOT NULL DEFAULT 10,
    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_hours" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" VARCHAR(8) NOT NULL,
    "end_time" VARCHAR(8) NOT NULL,
    CONSTRAINT "company_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_photos" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "image_path" VARCHAR(255) NOT NULL,
    "caption" VARCHAR(120) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_members" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    CONSTRAINT "company_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255) NOT NULL DEFAULT '',
    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professionals" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "bio" VARCHAR(255) NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "slot_minutes" INTEGER NOT NULL DEFAULT 30,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_services" (
    "id" SERIAL NOT NULL,
    "professional_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "price" DECIMAL(8,2),
    "slot_minutes" INTEGER,
    CONSTRAINT "professional_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "working_hours" (
    "id" SERIAL NOT NULL,
    "professional_id" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" VARCHAR(8) NOT NULL,
    "end_time" VARCHAR(8) NOT NULL,
    "slot_minutes" INTEGER,
    CONSTRAINT "working_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breaks" (
    "id" SERIAL NOT NULL,
    "professional_id" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" VARCHAR(8) NOT NULL,
    "end_time" VARCHAR(8) NOT NULL,
    "label" VARCHAR(60) NOT NULL DEFAULT '',
    CONSTRAINT "breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" SERIAL NOT NULL,
    "professional_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'confirmed',
    "notes" VARCHAR(255) NOT NULL DEFAULT '',
    "price" DECIMAL(8,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" SERIAL NOT NULL,
    "appointment_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(500) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_notes" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_off" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "professional_id" INTEGER,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" VARCHAR(120) NOT NULL DEFAULT '',
    CONSTRAINT "time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_companies" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "favorite_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" INTEGER,
    "actor_label" VARCHAR(255) NOT NULL DEFAULT '',
    "action" VARCHAR(40) NOT NULL,
    "company_id" INTEGER,
    "company_label" VARCHAR(140) NOT NULL DEFAULT '',
    "target_type" VARCHAR(40) NOT NULL DEFAULT '',
    "target_id" INTEGER,
    "target_label" VARCHAR(255) NOT NULL DEFAULT '',
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip" VARCHAR(45),
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" VARCHAR(255) NOT NULL DEFAULT '',
    "ip" VARCHAR(45),
    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

CREATE UNIQUE INDEX "company_members_company_id_user_id_key" ON "company_members"("company_id", "user_id");

CREATE UNIQUE INDEX "professional_services_professional_id_service_id_key" ON "professional_services"("professional_id", "service_id");

CREATE INDEX "appointments_professional_id_start_idx" ON "appointments"("professional_id", "start");

CREATE INDEX "appointments_customer_id_idx" ON "appointments"("customer_id");

CREATE UNIQUE INDEX "reviews_appointment_id_key" ON "reviews"("appointment_id");

CREATE UNIQUE INDEX "customer_notes_company_id_customer_id_key" ON "customer_notes"("company_id", "customer_id");

CREATE UNIQUE INDEX "favorite_companies_user_id_company_id_key" ON "favorite_companies"("user_id", "company_id");

CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

CREATE UNIQUE INDEX "auth_sessions_key_hash_key" ON "auth_sessions"("key_hash");

ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "company_hours" ADD CONSTRAINT "company_hours_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_photos" ADD CONSTRAINT "company_photos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "services" ADD CONSTRAINT "services_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "professionals" ADD CONSTRAINT "professionals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "professional_services" ADD CONSTRAINT "professional_services_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "professional_services" ADD CONSTRAINT "professional_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "breaks" ADD CONSTRAINT "breaks_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "time_off" ADD CONSTRAINT "time_off_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "time_off" ADD CONSTRAINT "time_off_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorite_companies" ADD CONSTRAINT "favorite_companies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorite_companies" ADD CONSTRAINT "favorite_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Extras que o Prisma não modela: valida horários/notas direto no banco.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_status_check" CHECK ("status" IN ('confirmed','completed','no_show','canceled'));
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6);
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6);
ALTER TABLE "company_hours" ADD CONSTRAINT "company_hours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6);

-- O acesso é feito só pela API (Prisma, role postgres): bloqueia a API pública do Supabase (PostgREST) nas tabelas.
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
