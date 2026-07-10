
-- Broaden check constraints
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_condition_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_condition_check CHECK (condition = ANY (ARRAY['new','good','fair','poor','damaged']));
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_status_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_status_check CHECK (status = ANY (ARRAY['available','in_use','repair','retired','disposed']));

-- Extend assets table
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS asset_code text,
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS vendor_id uuid,
  ADD COLUMN IF NOT EXISTS purchase_date date,
  ADD COLUMN IF NOT EXISTS purchase_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS current_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS warranty_expiry date,
  ADD COLUMN IF NOT EXISTS invoice_ref text,
  ADD COLUMN IF NOT EXISTS qr_value text,
  ADD COLUMN IF NOT EXISTS barcode_value text,
  ADD COLUMN IF NOT EXISTS useful_life_years int DEFAULT 5,
  ADD COLUMN IF NOT EXISTS assigned_to_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_label text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE UNIQUE INDEX IF NOT EXISTS assets_asset_code_key ON public.assets(asset_code) WHERE asset_code IS NOT NULL;

UPDATE public.assets SET status = 'available' WHERE status = 'storage';
UPDATE public.assets SET status = 'repair' WHERE status = 'maintenance';

CREATE TABLE IF NOT EXISTS public.asset_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_categories TO authenticated;
GRANT ALL ON public.asset_categories TO service_role;
ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ac_read ON public.asset_categories;
CREATE POLICY ac_read ON public.asset_categories FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'));
DROP POLICY IF EXISTS ac_write ON public.asset_categories;
CREATE POLICY ac_write ON public.asset_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS trg_asset_categories_updated ON public.asset_categories;
CREATE TRIGGER trg_asset_categories_updated BEFORE UPDATE ON public.asset_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.asset_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  category_hint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_vendors TO authenticated;
GRANT ALL ON public.asset_vendors TO service_role;
ALTER TABLE public.asset_vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS av_read ON public.asset_vendors;
CREATE POLICY av_read ON public.asset_vendors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'));
DROP POLICY IF EXISTS av_write ON public.asset_vendors;
CREATE POLICY av_write ON public.asset_vendors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS trg_asset_vendors_updated ON public.asset_vendors;
CREATE TRIGGER trg_asset_vendors_updated BEFORE UPDATE ON public.asset_vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='assets_category_id_fkey') THEN
    ALTER TABLE public.assets ADD CONSTRAINT assets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.asset_categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='assets_vendor_id_fkey') THEN
    ALTER TABLE public.assets ADD CONSTRAINT assets_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.asset_vendors(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.asset_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  assignee_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assignee_label text NOT NULL,
  allocated_at date NOT NULL DEFAULT CURRENT_DATE,
  expected_return_at date,
  returned_at date,
  return_condition text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_allocations TO authenticated;
GRANT ALL ON public.asset_allocations TO service_role;
ALTER TABLE public.asset_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aa_admin ON public.asset_allocations;
CREATE POLICY aa_admin ON public.asset_allocations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS trg_asset_allocations_updated ON public.asset_allocations;
CREATE TRIGGER trg_asset_allocations_updated BEFORE UPDATE ON public.asset_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.asset_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  scheduled_for date,
  completed_at date,
  type text NOT NULL DEFAULT 'general',
  cost numeric(12,2) DEFAULT 0,
  performed_by text,
  notes text,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_maintenance TO authenticated;
GRANT ALL ON public.asset_maintenance TO service_role;
ALTER TABLE public.asset_maintenance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS am_admin ON public.asset_maintenance;
CREATE POLICY am_admin ON public.asset_maintenance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS trg_asset_maintenance_updated ON public.asset_maintenance;
CREATE TRIGGER trg_asset_maintenance_updated BEFORE UPDATE ON public.asset_maintenance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.asset_amc (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.asset_vendors(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  coverage text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_amc TO authenticated;
GRANT ALL ON public.asset_amc TO service_role;
ALTER TABLE public.asset_amc ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS amc_admin ON public.asset_amc;
CREATE POLICY amc_admin ON public.asset_amc FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS trg_asset_amc_updated ON public.asset_amc;
CREATE TRIGGER trg_asset_amc_updated BEFORE UPDATE ON public.asset_amc
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SEED
INSERT INTO public.asset_categories (name, description) VALUES
  ('Electronics','Projectors, displays, AV equipment'),
  ('Furniture','Desks, chairs, cabinets'),
  ('Lab Equipment','Science and computer lab equipment'),
  ('Sports Equipment','Balls, mats, gear'),
  ('IT Hardware','Laptops, desktops, networking'),
  ('Vehicles','School buses and vans')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.asset_vendors (name, contact_name, email, phone, category_hint)
SELECT * FROM (VALUES
  ('TechSupply Co.','Rahul Menon','sales@techsupply.example','+91 98100 11111','Electronics / IT'),
  ('ClassicFurnish Ltd.','Priya Nair','orders@classicfurnish.example','+91 98100 22222','Furniture'),
  ('SportsPro Distributors','Karan Iyer','hello@sportspro.example','+91 98100 33333','Sports Equipment')
) AS v(name, contact_name, email, phone, category_hint)
WHERE NOT EXISTS (SELECT 1 FROM public.asset_vendors av WHERE av.name = v.name);

DELETE FROM public.asset_amc;
DELETE FROM public.asset_maintenance;
DELETE FROM public.asset_allocations;
DELETE FROM public.assets;

DO $$
DECLARE
  cat_elec uuid; cat_furn uuid; cat_lab uuid; cat_sport uuid; cat_it uuid; cat_veh uuid;
  ven_tech uuid; ven_furn uuid; ven_sport uuid;
BEGIN
  SELECT id INTO cat_elec FROM public.asset_categories WHERE name='Electronics';
  SELECT id INTO cat_furn FROM public.asset_categories WHERE name='Furniture';
  SELECT id INTO cat_lab  FROM public.asset_categories WHERE name='Lab Equipment';
  SELECT id INTO cat_sport FROM public.asset_categories WHERE name='Sports Equipment';
  SELECT id INTO cat_it   FROM public.asset_categories WHERE name='IT Hardware';
  SELECT id INTO cat_veh  FROM public.asset_categories WHERE name='Vehicles';
  SELECT id INTO ven_tech FROM public.asset_vendors WHERE name='TechSupply Co.';
  SELECT id INTO ven_furn FROM public.asset_vendors WHERE name='ClassicFurnish Ltd.';
  SELECT id INTO ven_sport FROM public.asset_vendors WHERE name='SportsPro Distributors';

  INSERT INTO public.assets(name, category, category_id, vendor_id, status, condition, location, assigned_to_label, asset_code, purchase_date, purchase_price, current_value, warranty_expiry, useful_life_years, qr_value, barcode_value, invoice_ref) VALUES
   ('Epson Projector EB-X49','Electronics',cat_elec,ven_tech,'in_use','good','Room 204','Room 204','AST-0001','2024-06-15',48000,38400,'2026-06-15',5,'AST-0001','8901234500001','INV-2024-118'),
   ('Dell Latitude 5540','IT Hardware',cat_it,ven_tech,'in_use','good','Staff Room','Anjali Nair','AST-0002','2024-01-10',72000,54000,'2027-01-10',5,'AST-0002','8901234500002','INV-2024-011'),
   ('Interactive Whiteboard 75"','Electronics',cat_elec,ven_tech,'in_use','good','Room 301','Room 301','AST-0003','2023-08-22',95000,66500,'2025-08-22',5,'AST-0003','8901234500003','INV-2023-207'),
   ('Ergonomic Teacher Chair','Furniture',cat_furn,ven_furn,'in_use','good','Room 105','Room 105','AST-0004','2024-03-01',6500,5525,NULL,7,'AST-0004','8901234500004','INV-2024-042'),
   ('HP LaserJet Pro M404','Electronics',cat_elec,ven_tech,'in_use','good','Admin Office','Admin Office','AST-0005','2023-11-12',24000,16800,'2025-11-12',5,'AST-0005','8901234500005','INV-2023-289'),
   ('Microscope BX53','Lab Equipment',cat_lab,ven_tech,'in_use','good','Biology Lab','Biology Lab','AST-0006','2023-05-20',85000,55250,'2026-05-20',10,'AST-0006','8901234500006','INV-2023-118'),
   ('iMac 24" M3','IT Hardware',cat_it,ven_tech,'in_use','new','Computer Lab','Computer Lab','AST-0007','2025-02-18',145000,130500,'2028-02-18',5,'AST-0007','8901234500007','INV-2025-032'),
   ('Basketball Rack (set)','Sports Equipment',cat_sport,ven_sport,'in_use','good','Sports Ground','PE Dept','AST-0008','2024-04-11',12000,9600,NULL,5,'AST-0008','8901234500008','INV-2024-088'),
   ('Study Desk 30-set','Furniture',cat_furn,ven_furn,'in_use','good','Room 102','Room 102','AST-0009','2023-07-01',135000,94500,NULL,10,'AST-0009','8901234500009','INV-2023-176'),
   ('Chemistry Fume Hood','Lab Equipment',cat_lab,ven_tech,'in_use','good','Chemistry Lab','Chemistry Lab','AST-0010','2024-09-05',185000,166500,'2027-09-05',10,'AST-0010','8901234500010','INV-2024-231'),
   ('Table Tennis Table','Sports Equipment',cat_sport,ven_sport,'in_use','good','Indoor Hall','PE Dept','AST-0011','2024-11-20',22000,19800,NULL,7,'AST-0011','8901234500011','INV-2024-301'),
   ('Wi-Fi Access Point (Aruba)','IT Hardware',cat_it,ven_tech,'in_use','good','Corridor B','IT Dept','AST-0012','2024-07-14',18000,14400,'2026-07-14',5,'AST-0012','8901234500012','INV-2024-165'),
   ('Spare Projector Sony VPL','Electronics',cat_elec,ven_tech,'available','good','Storage',NULL,'AST-0013','2023-02-10',52000,31200,'2025-02-10',5,'AST-0013','8901234500013','INV-2023-034'),
   ('Stackable Chairs (20-set)','Furniture',cat_furn,ven_furn,'available','good','Storage',NULL,'AST-0014','2024-08-08',24000,20400,NULL,7,'AST-0014','8901234500014','INV-2024-201'),
   ('Football (case of 12)','Sports Equipment',cat_sport,ven_sport,'available','new','PE Store',NULL,'AST-0015','2025-01-22',9600,8640,NULL,3,'AST-0015','8901234500015','INV-2025-018'),
   ('HP Elitebook 840','IT Hardware',cat_it,ven_tech,'available','good','IT Store',NULL,'AST-0016','2024-05-30',85000,68000,'2027-05-30',5,'AST-0016','8901234500016','INV-2024-132'),
   ('Yoga Mat Set (30)','Sports Equipment',cat_sport,ven_sport,'available','good','PE Store',NULL,'AST-0017','2024-10-01',7500,6375,NULL,4,'AST-0017','8901234500017','INV-2024-266'),
   ('Whiteboard Portable','Furniture',cat_furn,ven_furn,'available','good','Storage',NULL,'AST-0018','2024-02-14',8500,7225,NULL,7,'AST-0018','8901234500018','INV-2024-029'),
   ('Air Conditioner 1.5T Room 208','Electronics',cat_elec,ven_tech,'repair','fair','Repair Bay',NULL,'AST-0019','2023-04-04',45000,29250,'2025-04-04',5,'AST-0019','8901234500019','INV-2023-076'),
   ('Photocopier Canon iR2425','Electronics',cat_elec,ven_tech,'repair','fair','Repair Bay',NULL,'AST-0020','2022-10-18',125000,62500,'2024-10-18',5,'AST-0020','8901234500020','INV-2022-244'),
   ('Treadmill FitPro X3','Sports Equipment',cat_sport,ven_sport,'repair','poor','Repair Bay',NULL,'AST-0021','2022-06-30',65000,26000,'2024-06-30',5,'AST-0021','8901234500021','INV-2022-142'),
   ('CRT Monitors (bulk 10)','IT Hardware',cat_it,ven_tech,'retired','poor','Warehouse',NULL,'AST-0022','2019-05-01',35000,0,'2021-05-01',5,'AST-0022','8901234500022','INV-2019-055'),
   ('Old Wooden Benches','Furniture',cat_furn,ven_furn,'retired','poor','Warehouse',NULL,'AST-0023','2018-08-15',18000,0,NULL,7,'AST-0023','8901234500023','INV-2018-088'),
   ('Broken Overhead Projector','Electronics',cat_elec,ven_tech,'disposed','poor','Disposed',NULL,'AST-0024','2017-03-11',22000,0,'2019-03-11',5,'AST-0024','8901234500024','INV-2017-021'),
   ('Damaged Cricket Kit','Sports Equipment',cat_sport,ven_sport,'disposed','poor','Disposed',NULL,'AST-0025','2019-09-09',15000,0,NULL,4,'AST-0025','8901234500025','INV-2019-145');
END $$;

-- Allocations
INSERT INTO public.asset_allocations(asset_id, assignee_label, allocated_at, notes)
SELECT id, COALESCE(assigned_to_label, location, 'General'), COALESCE(purchase_date, CURRENT_DATE - 30), 'Initial deployment'
FROM public.assets WHERE status='in_use';

INSERT INTO public.asset_allocations(asset_id, assignee_label, allocated_at, returned_at, return_condition, notes)
SELECT id, 'Room 108', CURRENT_DATE - 180, CURRENT_DATE - 60, 'good', 'Reassigned during term break'
FROM public.assets WHERE asset_code='AST-0013';
INSERT INTO public.asset_allocations(asset_id, assignee_label, allocated_at, returned_at, return_condition, notes)
SELECT id, 'Room 205', CURRENT_DATE - 120, CURRENT_DATE - 30, 'good', 'Returned after event'
FROM public.assets WHERE asset_code='AST-0014';
INSERT INTO public.asset_allocations(asset_id, assignee_label, allocated_at, returned_at, return_condition, notes)
SELECT id, 'PE Dept', CURRENT_DATE - 90, CURRENT_DATE - 15, 'needs_repair', 'Returned damaged, routed to repair'
FROM public.assets WHERE asset_code='AST-0021';

-- Maintenance
INSERT INTO public.asset_maintenance(asset_id, completed_at, type, cost, performed_by, notes, status)
SELECT id, CURRENT_DATE - (n*20)::int, 'preventive', 1200 + (n*100), 'TechSupply Co.', 'Routine service', 'completed'
FROM (SELECT id, row_number() over () as n FROM public.assets WHERE status IN ('in_use','repair') LIMIT 8) s;

INSERT INTO public.asset_maintenance(asset_id, scheduled_for, type, notes, status)
SELECT id, CURRENT_DATE + (n*7)::int, 'preventive', 'Scheduled quarterly service', 'scheduled'
FROM (SELECT id, row_number() over () as n FROM public.assets WHERE status='in_use' LIMIT 4) s;

-- AMC
INSERT INTO public.asset_amc(asset_id, vendor_id, start_date, end_date, coverage, notes)
SELECT id, vendor_id, CURRENT_DATE - 335, CURRENT_DATE + 25, 'Comprehensive incl. parts', 'Expiring soon - renew'
FROM public.assets WHERE asset_code='AST-0003';
INSERT INTO public.asset_amc(asset_id, vendor_id, start_date, end_date, coverage, notes)
SELECT id, vendor_id, CURRENT_DATE - 200, CURRENT_DATE + 165, 'Labour only', 'Standard AMC'
FROM public.assets WHERE asset_code='AST-0007';
INSERT INTO public.asset_amc(asset_id, vendor_id, start_date, end_date, coverage, notes)
SELECT id, vendor_id, CURRENT_DATE - 90, CURRENT_DATE + 275, 'Comprehensive', 'New contract'
FROM public.assets WHERE asset_code='AST-0010';
