export type CodStatus   = 'pending' | 'collected' | 'returned'
export type ClaimStatus = 'claimed' | 'approved'  | 'paid'

export interface Order {
  id: string
  tracking_no: string
  shipheyo_order_id: string | null
  date: string
  customer_id: string | null
  service_type: string
  ups_cost: number
  customer_charge: number
  profit: number
  sales_person: string | null
  cod_amount: number
  cod_status: CodStatus | null
  claim_status: ClaimStatus | null
  created_at: string
  updated_at: string
}
