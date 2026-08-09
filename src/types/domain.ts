export interface UserSession {
  id: string
  account: string
  token: string
  nickname?: string
  avatar?: string
}

export interface CartItem {
  id?: string
  skuId: string
  name: string
  picture: string
  price: number
  count: number
  selected: boolean
  attrsText: string
  stock?: number
}

export interface ProductSku {
  id: string
  price: number
  oldPrice?: number
  inventory: number
  specs: Array<{ name: string; valueName: string }>
}

export interface ProductDetail {
  id: string
  name: string
  desc?: string
  price: number
  oldPrice?: number
  mainPictures: string[]
  skus: ProductSku[]
  specs: Array<{
    id: string
    name: string
    values: Array<{ name: string; picture?: string }>
  }>
  [key: string]: unknown
}

export interface SkuSelection {
  skuId: string
  price: number
  oldPrice?: number
  inventory: number
  specsText: string
}

export interface CheckoutPreview {
  goods: CartItem[]
  userAddresses: Array<{ id: string; isDefault: number; [key: string]: unknown }>
  summary: {
    goodsCount: number
    totalPrice: number
    totalPayPrice: number
    postFee: number
  }
}
