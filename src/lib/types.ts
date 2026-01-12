

export type StoreSettings = {
    storeName: string;
    storeCity: string;
    storeAddress: string;
    pixKey: string;
    storePhone: string;
    logoUrl?: string;
    accessControlEnabled?: boolean;
    commercialHourStart?: string;
    commercialHourEnd?: string;
    wapiInstance?: string;
    wapiToken?: string;
};


export type Product = {
  id: string;
  code?: string;
  name: string;
  description: string;
  longDescription: string;
  price: number;
  cost?: number;
  onSale?: boolean;
  promotionEndDate?: string;
  isHidden?: boolean;
  category: string;
  subcategory?: string;
  stock: number;
  imageUrls: string[];
  maxInstallments?: number;
  paymentCondition?: string; 
  commissionType?: 'percentage' | 'fixed';
  commissionValue?: number;
  "data-ai-hint"?: string;
  createdAt: string; 
};

export type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
};

export type Attachment = {
  name: string;
  type: 'image' | 'pdf';
  url: string;
  comment?: string;
  addedAt?: string; // ISO String
  addedBy?: string; // User name
};

export type CustomerInfo = {
  code?: string;
  name: string;
  cpf?: string;
  phone: string;
  phone2?: string;
  phone3?: string;
  email?: string;
  zip: string;
  address: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  password?: string;
  observations?: string;
  sellerId?: string;
  sellerName?: string;
};

export type Payment = {
  id: string;
  amount: number;
  date: string;
  method: 'Dinheiro' | 'Pix' | 'Cartão (Crédito)' | 'Cartão (Débito)';
  change?: number;
  receivedBy?: string; // User name
}

export type Installment = {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  status: 'Pendente' | 'Pago';
  paidAmount: number;
  paymentDate?: string;
  payments: Payment[];
}

export type PaymentMethod = 'Crediário' | 'Pix' | 'Dinheiro';

export type Order = {
  id: string;
  customer: CustomerInfo;
  items: CartItem[];
  total: number;
  discount?: number;
  downPayment?: number;
  installments: number;
  installmentValue: number;
  date: string;
  firstDueDate?: Date;
  status: 'Processando' | 'Enviado' | 'Entregue' | 'Cancelado' | 'Excluído';
  paymentMethod: PaymentMethod;
  installmentDetails: Installment[];
  attachments?: Attachment[];
  sellerId?: string;
  sellerName?: string;
  commission?: number;
  commissionPaid?: boolean;
  isCommissionManual?: boolean;
  observations?: string;
  source?: 'Online' | 'Manual';
};

export type CommissionPayment = {
    id: string;
    sellerId: string;
    sellerName: string;
    amount: number;
    paymentDate: string;
    period: string;
    orderIds: string[];
};

export type UserRole = 'admin' | 'gerente' | 'vendedor';

export type User = {
  id: string;
  username: string;
  password?: string; 
  name: string;
  role: UserRole;
};

export type Category = {
  id: string;
  name: string;
  order: number;
  subcategories: string[];
};

export type AuditLog = {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  details: string;
};

export type AppSection = 
    | 'pedidos' 
    | 'criar-pedido'
    | 'clientes' 
    | 'produtos' 
    | 'categorias' 
    | 'financeiro'
    | 'minhas-comissoes'
    | 'auditoria'
    | 'configuracao'
    | 'usuarios'
    | 'avarias';

export type RolePermissions = Record<UserRole, AppSection[]>;

export type StockAuditProduct = {
    productId: string;
    productName: string;
    systemStock: number;
    physicalCount: number | null;
    difference: number | null;
};

export type StockAudit = {
    id: string; // e.g., "audit-2023-12"
    month: string;
    year: string;
    createdAt: string; // ISO String
    auditedBy: string; // User ID
    auditedByName: string;
    products: StockAuditProduct[];
};

export type Avaria = {
  id: string;
  createdAt: string; // ISO String
  createdBy: string; // User ID
  createdByName: string; // User name
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  description: string;
};

export type ChatAttachment = {
  name: string;
  type: 'image' | 'pdf'; // or more types like 'video', 'document'
  url: string; // data:URL or a real URL
};

export type ChatMessage = {
  id: string;
  text: string;
  timestamp: string; // ISO String
  sender: 'visitor' | 'seller';
  senderName: string; // "Visitante" or seller's name
  sessionId: string;
  attachment?: ChatAttachment;
  type?: 'survey' | 'feedback';
  rating?: 'Ótimo' | 'Bom' | 'Ruim';
};

export type ChatSession = {
  id: string; // Corresponds to visitorId
  visitorId: string;
  visitorName?: string;
  status: 'open' | 'active' | 'closed' | 'awaiting-feedback';
  createdAt: string; // ISO String
  lastMessageAt: string; // ISO String
  lastMessageText: string;
  sellerId?: string;
  sellerName?: string;
  unreadBySeller: boolean;
  unreadByVisitor: boolean;
  satisfaction?: 'Ótimo' | 'Bom' | 'Ruim';
};

// This can be removed if not used elsewhere, but good for type safety
export type WhatsAppIconProps = {};
