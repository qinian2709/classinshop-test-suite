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
    addressUpdate: '/user/address/update',
    addressDelete: '/user/address/delete',
    addressSetDefault: '/user/address/default',
  },
  shop: {
    info: '/shop/info',
    decoration: '/shop/decoration',
    goodsList: '/shop/goods',
    goodsDetail: (id: string | number) => `/shop/goods/${id}`,
    couponDetail: (id: string | number) => `/shop/coupon/${id}`,
    availableCoupons: '/shop/coupon/available',
    receiveCoupon: (id: string | number) => `/shop/coupon/${id}/receive`,
    userCouponList: '/shop/user/coupon/list',
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
    // 学员端·我的预约（/student 分组，跨店聚合）
    studentList: '/student/appointment',
    studentDetail: (id: string | number) => `/student/appointment/${id}`,
    studentCancel: (id: string | number) => `/student/appointment/${id}/cancel`,
    // 学员端约课链路（/shop/appointment 分组，按 X-Shop-Domain 解析店铺）
    orderItem: (orderItemId: string | number) => `/shop/appointment/order/${orderItemId}`,
    orderTeachers: (orderItemId: string | number) =>
      `/shop/appointment/order/${orderItemId}/teachers`,
    orderSlots: (orderItemId: string | number) => `/shop/appointment/order/${orderItemId}/slots`,
    teacher: (teacherId: string | number) => `/shop/appointment/teacher/${teacherId}`,
    check: '/shop/appointment/check',
    book: '/shop/appointment/book',
    my: '/shop/appointment/my',
    myDetail: (id: string | number) => `/shop/appointment/my/${id}`,
    myCancel: (id: string | number) => `/shop/appointment/my/${id}/cancel`,
  },
  merchant: {
    status: '/merchant/status',
  },
  // 商家后台（/shop/:shopId/*，需 JWT + 店铺成员 + GetShopByID）
  shopAdmin: {
    goodsCreate: (shopId: string | number) => `/shop/${shopId}/goods/create`,
    goodsUpdate: (shopId: string | number) => `/shop/${shopId}/goods/update`,
    goodsStatus: (shopId: string | number) => `/shop/${shopId}/goods/status`,
    goodsDelete: (shopId: string | number) => `/shop/${shopId}/goods/delete`,
    goodsDetail: (shopId: string | number, goodsId: string | number) =>
      `/shop/${shopId}/goods/${goodsId}`,
    goodsList: (shopId: string | number) => `/shop/${shopId}/goods/list`,
    appointmentTeachers: (shopId: string | number) => `/shop/${shopId}/appointment/teachers`,
    couponCreate: (shopId: string | number) => `/shop/${shopId}/coupon/create`,
    couponDetail: (shopId: string | number, couponId: string | number) =>
      `/shop/${shopId}/coupon/${couponId}`,
    couponList: (shopId: string | number) => `/shop/${shopId}/coupon/list`,
    couponStatus: (shopId: string | number) => `/shop/${shopId}/coupon/status`,
    couponCodeVoid: (shopId: string | number) => `/shop/${shopId}/coupon/code/void`,
    notificationsSummary: (shopId: string | number) => `/shop/${shopId}/notifications/summary`,
  },
} as const;
