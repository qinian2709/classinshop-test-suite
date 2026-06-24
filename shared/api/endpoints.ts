/**
 * 接口路径常量（相对 /api/v1）。集中维护，避免散落在用例中。
 * 路径来源：classinshop-go/api/http/api.go。
 */
export const Endpoints = {
  system: {
    info: '/system/info',
    agreement: '/system/agreement',
    agreementList: '/system/agreement/list',
    sendCode: '/system/sendcode',
    cosSign: '/system/cos/sign',
    cosDownloadSign: '/system/cos/download/sign',
  },
  user: {
    loginBySign: '/user/loginbysign',
    signup: '/user/signup',
    logout: '/user/logout',
    authUser: '/auth/user',
    myShops: '/user/shops',
    orders: '/user/orders',
    orderDetail: (id: string | number) => `/user/order/${id}/detail`,
    couponList: '/user/coupon/list',
    refundRequest: (id: string | number) => `/user/order/${id}/refund/request`,
    addressList: '/user/address/list',
    addressCreate: '/user/address',
    addressDelete: '/user/address/delete',
  },
  shop: {
    info: '/shop/info',
    decoration: '/shop/decoration',
    goodsList: '/shop/goods',
    goodsDetail: (id: string | number) => `/shop/goods/${id}`,
    availableCoupons: '/shop/coupon/available',
    receiveCoupon: (id: string | number) => `/shop/coupon/${id}/receive`,
    orderCreate: '/shop/goods/order/create',
    orderCalculate: '/shop/goods/order/calculate',
  },
  org: {
    detail: (orgId: string | number) => `/org/${orgId}/detail`,
  },
  classin: {
    classList: (agencyId: string | number) => `/classin/class/${agencyId}`,
  },
  goods: {
    detail: (id: string | number) => `/goods/${id}`,
    orderCreate: '/goods/order/create',
    orderCalculate: '/goods/order/calculate',
  },
  appointment: {
    studentList: '/student/appointment',
    studentDetail: (id: string | number) => `/student/appointment/${id}`,
    studentCancel: (id: string | number) => `/student/appointment/${id}/cancel`,
    check: '/shop/appointment/check',
    book: '/shop/appointment/book',
    my: '/shop/appointment/my',
  },
  merchant: {
    status: '/merchant/status',
  },
  shopAdmin: {
    goodsCreate: (shopId: string | number) => `/shop/${shopId}/goods/create`,
    goodsUpdate: (shopId: string | number) => `/shop/${shopId}/goods/update`,
    goodsStatus: (shopId: string | number) => `/shop/${shopId}/goods/status`,
    goodsDelete: (shopId: string | number) => `/shop/${shopId}/goods/delete`,
    goodsDetail: (shopId: string | number, goodsId: string | number) =>
      `/shop/${shopId}/goods/${goodsId}`,
    goodsList: (shopId: string | number) => `/shop/${shopId}/goods/list`,
    appointmentTeachers: (shopId: string | number) => `/shop/${shopId}/appointment/teachers`,
  },
} as const;
