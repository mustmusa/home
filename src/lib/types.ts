export type Role = "wife" | "warehouse" | "admin";

export type House = {
  id: string;
  name: string;
};

export type AppUser = {
  id: string;
  name: string;
  phone: string;
  role: Role;
  house_id: string | null;
};

export type SessionPayload = {
  uid: string;
  name: string;
  role: Role;
  houseId: string | null;
};

export type RequestStatus = "pending" | "purchased" | "cancelled";

export type PurchaseRequest = {
  id: string;
  house_id: string;
  raw_text: string;
  item_name: string;
  quantity_text: string | null;
  status: RequestStatus;
  requested_by: string | null;
  requested_at: string;
};

export type WarehouseItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  unit_cost: number | null;
  notes: string | null;
  updated_at: string;
};

export type Destination = "house" | "warehouse";

export type PurchaseLine = {
  id: string;
  purchase_id: string | null;
  item_name: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number;
  destination: Destination;
  house_id: string | null;
  matched_request_id: string | null;
  source: "invoice" | "warehouse_pull";
  created_at: string;
};

export type Purchase = {
  id: string;
  invoice_image_path: string | null;
  purchased_by: string | null;
  purchased_at: string;
  total_amount: number;
  warehouse_total: number;
};

export type ParsedRequestItem = {
  item_name: string;
  quantity_text: string | null;
};

export type ExtractedInvoiceLine = {
  item_name: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
  suggested_request_id: string | null;
};
