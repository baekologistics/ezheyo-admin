export interface Customer {
  id: string
  shipheyo_userid: string | null
  name: string
  email: string
  phone: string | null
  margin_rate: number
  payment_type: 'Prepay' | 'Monthly'
  status: 'Active' | 'Inactive'
  sales_person: string | null
  memo: string | null
  created_date: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}
