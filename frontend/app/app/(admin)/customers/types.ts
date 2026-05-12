export type SalesAssignment = {
  id: string           // sales_person id (UUID)
  name: string
  ratio: number
}

export type Customer = {
  id: string
  name: string
  email: string
  phone: string
  marginRate: string
  paymentType: 'Prepay' | 'Monthly'
  createdDate: string
  status: 'Active' | 'Inactive'
  salesPerson: string          // display string from customers.sales_person
  assignments: SalesAssignment[]
  memo: string
  lastSynced: string
}

export type SalesPerson = {
  id: string
  name: string
  email: string
  phone: string
  is_active: boolean
}

// Legacy list kept for any components that still reference it
export const SALES_PERSONS = ['Alice Yoon', 'David Park', 'Jenny Oh']
