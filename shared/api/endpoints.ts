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
    feedback: '/system/feedback',
  },
  user: {
    loginBySign: '/user/loginbysign',
    loginByWhiteUser: '/user/loginbywhiteuser',
    signup: '/user/signup',
    logout: '/user/logout',
    authUser: '/auth/user',
    myShops: '/user/shops',
    orders: '/user/orders',
    orderDetail: (id: string | number) => `/user/order/${id}/detail`,
    orderPayCode: (id: string | number) => `/order/${id}/pay_code_info`,
    couponList: '/user/coupon/list',
    refundRequest: (id: string | number) => `/user/order/${id}/refund/request`,
    refundBookingPreview: (id: string | number) => `/user/order/${id}/refund/booking-preview`,
    addressList: '/user/address/list',
    addressCreate: '/user/address',
    addressUpdate: '/user/address/update',
    addressDelete: '/user/address/delete',
    addressSetDefault: '/user/address/default',
    search: '/user/search',
    update: '/update/user',
  },
  shop: {
    info: '/shop/info',
    decoration: '/shop/decoration',
    decorationPage: (pageId: string | number) => `/shop/decoration/${pageId}`,
    goodsList: '/shop/goods',
    goodsDetail: (id: string | number) => `/shop/goods/${id}`,
    goodsByProduct: (productId: string | number) => `/shop/goods/product/${productId}`,
    goodsGroupActivity: (id: string | number) => `/shop/goods/${id}/group-activity`,
    couponDetail: (id: string | number) => `/shop/coupon/${id}`,
    availableCoupons: '/shop/coupon/available',
    receiveCoupon: (id: string | number) => `/shop/coupon/${id}/receive`,
    userCouponList: '/shop/user/coupon/list',
    orderCreate: '/shop/goods/order/create',
    orderCalculate: '/shop/goods/order/calculate',
    // 限时折扣 C 端
    limitedTimeDiscountHome: '/shop/activity/limited-time-discount/home',
    limitedTimeDiscountList: '/shop/activity/limited-time-discount/list',
    limitedTimeDiscountDetail: (id: string | number) => `/shop/activity/limited-time-discount/${id}`,
    // 拼团 C 端
    groupActivityDetail: (id: string | number) => `/shop/activity/group/${id}`,
    groupActivityOpenInstances: (id: string | number) => `/shop/activity/group/${id}/instances/open`,
    groupInstanceDetail: (instanceId: string | number) => `/shop/activity/group/instances/${instanceId}`,
    // 联报 C 端
    multiCourseActivityGoods: (id: string | number) => `/shop/activity/multi-course/${id}/goods`,
    // 学员约课 C 端
    appointmentOrderDetail: (orderItemId: string | number) => `/shop/appointment/order/${orderItemId}`,
    appointmentOrderTeachers: (orderItemId: string | number) =>
      `/shop/appointment/order/${orderItemId}/teachers`,
    appointmentOrderSlots: (orderItemId: string | number) =>
      `/shop/appointment/order/${orderItemId}/slots`,
    appointmentTeacherProfile: (teacherId: string | number) => `/shop/appointment/teacher/${teacherId}`,
    appointmentTeacherSlots: (teacherId: string | number) =>
      `/shop/appointment/teacher/${teacherId}/slots`,
    appointmentCheck: '/shop/appointment/check',
    appointmentBook: '/shop/appointment/book',
    appointmentMy: '/shop/appointment/my',
    appointmentMyDetail: (id: string | number) => `/shop/appointment/my/${id}`,
    appointmentMyCancel: (id: string | number) => `/shop/appointment/my/${id}/cancel`,
    appointmentMyChange: (id: string | number) => `/shop/appointment/my/${id}/change`,
    // 学员学习列表
    learnList: '/shop/user/learn-list',
    // 录播课 C 端（私域试看 / 购后学习 / 文档预览 / 文件下载）
    recordedActivityDetail: (activityId: string | number) =>
      `/shop/recorded/activity/${activityId}/detail`,
    recordedDocImage: '/shop/recorded/course/doc-image',
    recordedDocWebOffice: '/shop/recorded/course/doc-weboffice',
    recordedDocWebOfficeToken: '/shop/recorded/course/doc-weboffice-token',
    recordedLearnHome: (orderItemId: string | number) => `/shop/recorded/${orderItemId}/home`,
    recordedStudyData: (orderItemId: string | number) => `/shop/recorded/${orderItemId}/study-data`,
    recordedStudyReport: '/shop/recorded/study/report',
    recordedActivityAccess: (orderItemId: string | number, activityId: string | number) =>
      `/shop/recorded/${orderItemId}/activities/${activityId}/access`,
    recordedFileDownloadSign: (orderItemId: string | number, fileId: string | number) =>
      `/shop/recorded/${orderItemId}/files/${fileId}/download-sign`,
    recordedFileStream: (
      orderItemId: string | number,
      activityId: string | number,
      fileId: string | number,
    ) => `/shop/recorded/${orderItemId}/activities/${activityId}/files/${fileId}/stream`,
    // 有价优惠券 C 端
    paidCouponLanding: (goodsId: string | number) => `/shop/paid-coupon/${goodsId}`,
  },
  org: {
    detail: (orgId: string | number) => `/org/${orgId}/detail`,
  },
  classin: {
    classList: (agencyId: string | number) => `/classin/class/${agencyId}`,
  },
  goods: {
    detail: (id: string | number) => `/goods/${id}`,
    activityPreview: (productId: string | number, activityId: string | number) =>
      `/goods/product/${productId}/course/activities/${activityId}/preview`,
    orderCreate: '/goods/order/create',
    orderCalculate: '/goods/order/calculate',
  },
  appointment: {
    // 学员端·我的预约（/student 分组，跨店聚合）
    studentList: '/student/appointment',
    studentDetail: (id: string | number) => `/student/appointment/${id}`,
    studentCancel: (id: string | number) => `/student/appointment/${id}/cancel`,
    studentOrderCourse: (orderId: string | number) => `/student/order-appointment/${orderId}`,
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
    // 商品管理
    goodsCreate: (shopId: string | number) => `/shop/${shopId}/goods/create`,
    goodsUpdate: (shopId: string | number) => `/shop/${shopId}/goods/update`,
    goodsStatus: (shopId: string | number) => `/shop/${shopId}/goods/status`,
    goodsDelete: (shopId: string | number) => `/shop/${shopId}/goods/delete`,
    goodsDetail: (shopId: string | number, goodsId: string | number) =>
      `/shop/${shopId}/goods/${goodsId}`,
    goodsList: (shopId: string | number) => `/shop/${shopId}/goods/list`,
    courseVideoTranscode: (shopId: string | number) => `/shop/${shopId}/course/video/transcode`,
    courseVideoTranscodeStatus: (shopId: string | number) =>
      `/shop/${shopId}/course/video/transcode-status`,
    storageCapacity: (shopId: string | number) => `/shop/${shopId}/storage/capacity`,
    attributeCreate: (shopId: string | number) => `/shop/${shopId}/goods/attribute/create`,
    attributeList: (shopId: string | number) => `/shop/${shopId}/goods/attribute/list`,
    // 约课老师
    appointmentTeachers: (shopId: string | number) => `/shop/${shopId}/appointment/teachers`,
    appointmentTeacherEntryShare: (shopId: string | number) =>
      `/shop/${shopId}/appointment/teacher-entry/share`,
    appointmentTeacherManageList: (shopId: string | number) =>
      `/shop/${shopId}/appointment/teacher-manage`,
    appointmentTeacherManageDetail: (shopId: string | number, teacherId: string | number) =>
      `/shop/${shopId}/appointment/teacher-manage/${teacherId}`,
    appointmentTeacherManageStats: (shopId: string | number) =>
      `/shop/${shopId}/appointment/teacher-manage/stats`,
    appointmentTeacherManageStatus: (shopId: string | number, teacherId: string | number) =>
      `/shop/${shopId}/appointment/teacher-manage/${teacherId}/status`,
    appointmentTeacherManageSort: (shopId: string | number, teacherId: string | number) =>
      `/shop/${shopId}/appointment/teacher-manage/${teacherId}/sort`,
    appointmentTeacherSyncClassIn: (shopId: string | number) =>
      `/shop/${shopId}/appointment/teacher-manage/sync-classin`,
    // 排课/课表
    appointmentSchedule: (shopId: string | number) => `/shop/${shopId}/appointment/schedule`,
    appointmentCreate: (shopId: string | number) => `/shop/${shopId}/appointment/create`,
    appointmentGoods: (shopId: string | number) => `/shop/${shopId}/appointment/goods`,
    appointmentCreatableOrders: (shopId: string | number) =>
      `/shop/${shopId}/appointment/creatable-orders`,
    appointmentOrderTeachers: (shopId: string | number) =>
      `/shop/${shopId}/appointment/order-teachers`,
    appointmentClassinRoomSettingsEcho: (shopId: string | number) =>
      `/shop/${shopId}/appointment/classin-room-settings-echo`,
    appointmentProductOptions: (shopId: string | number) =>
      `/shop/${shopId}/appointment/product-options`,
    appointmentStudents: (shopId: string | number) => `/shop/${shopId}/appointment/students`,
    appointmentStudentOrders: (shopId: string | number) =>
      `/shop/${shopId}/appointment/student-orders`,
    appointmentCancel: (shopId: string | number, appointmentId: string | number) =>
      `/shop/${shopId}/appointment/${appointmentId}/cancel`,
    appointmentBatchCreate: (shopId: string | number) => `/shop/${shopId}/appointment/batch-create`,
    appointmentBatchDelete: (shopId: string | number) => `/shop/${shopId}/appointment/batch-delete`,
    appointmentAssistCreate: (shopId: string | number) => `/shop/${shopId}/appointment/assist-create`,
    // 约课学员管理
    appointmentBookingStudents: (shopId: string | number) =>
      `/shop/${shopId}/appointment/booking-students`,
    appointmentBookingStudentDetail: (shopId: string | number, studentUserId: string | number) =>
      `/shop/${shopId}/appointment/booking-students/${studentUserId}`,
    appointmentBookingStudentStats: (shopId: string | number) =>
      `/shop/${shopId}/appointment/booking-students/stats`,
    appointmentBookingStudentOrders: (shopId: string | number, studentUserId: string | number) =>
      `/shop/${shopId}/appointment/booking-students/${studentUserId}/orders`,
    appointmentBookingStudentRemark: (shopId: string | number, studentUserId: string | number) =>
      `/shop/${shopId}/appointment/booking-students/${studentUserId}/remark`,
    appointmentBookingStudentAdjustLogs: (shopId: string | number, studentUserId: string | number) =>
      `/shop/${shopId}/appointment/booking-students/${studentUserId}/adjust-logs`,
    // 预约记录
    appointmentRecords: (shopId: string | number) => `/shop/${shopId}/appointment/records`,
    appointmentRecordDetail: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/appointment/records/${id}`,
    appointmentRecordCancel: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/appointment/records/${id}/cancel`,
    appointmentRecordRemark: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/appointment/records/${id}/remark`,
    appointmentRecordReschedule: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/appointment/records/${id}/reschedule`,
    // 订单约课管理
    appointmentOrderAdjust: (shopId: string | number, orderItemId: string | number) =>
      `/shop/${shopId}/orders/${orderItemId}/appointment/adjust`,
    appointmentOrderAdjustLogs: (shopId: string | number, orderItemId: string | number) =>
      `/shop/${shopId}/orders/${orderItemId}/appointment/adjust-logs`,
    appointmentOrderExtend: (shopId: string | number, orderItemId: string | number) =>
      `/shop/${shopId}/orders/${orderItemId}/appointment/extend`,
    appointmentOrderFreeze: (shopId: string | number, orderItemId: string | number) =>
      `/shop/${shopId}/orders/${orderItemId}/appointment/freeze`,
    appointmentOrderUnfreeze: (shopId: string | number, orderItemId: string | number) =>
      `/shop/${shopId}/orders/${orderItemId}/appointment/unfreeze`,
    appointmentOrderActiveFreeze: (shopId: string | number, orderItemId: string | number) =>
      `/shop/${shopId}/orders/${orderItemId}/appointment/active-freeze`,
    // 改约
    appointmentChanges: (shopId: string | number) => `/shop/${shopId}/appointment/changes`,
    appointmentChangeDetail: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/appointment/changes/${id}`,
    appointmentChangeTeachers: (shopId: string | number) =>
      `/shop/${shopId}/appointment/changes/teachers`,
    // 老师时段
    appointmentTeacherSlots: (shopId: string | number) =>
      `/shop/${shopId}/appointment/teacher-slots`,
    appointmentTeacherRescheduleSlots: (shopId: string | number, teacherId: string | number) =>
      `/shop/${shopId}/appointment/teachers/${teacherId}/available-slots`,
    // 优惠券管理
    couponCreate: (shopId: string | number) => `/shop/${shopId}/coupon/create`,
    couponUpdate: (shopId: string | number) => `/shop/${shopId}/coupon/update`,
    couponDetail: (shopId: string | number, couponId: string | number) =>
      `/shop/${shopId}/coupon/${couponId}`,
    couponList: (shopId: string | number) => `/shop/${shopId}/coupon/list`,
    couponStatus: (shopId: string | number) => `/shop/${shopId}/coupon/status`,
    couponCodeVoid: (shopId: string | number) => `/shop/${shopId}/coupon/code/void`,
    couponStockIncrease: (shopId: string | number) => `/shop/${shopId}/coupon/stock/increase`,
    couponCodeList: (shopId: string | number, couponId: string | number) =>
      `/shop/${shopId}/coupon/${couponId}/code/list`,
    couponShare: (shopId: string | number, couponId: string | number) =>
      `/shop/${shopId}/coupon/${couponId}/share`,
    couponGoodsList: (shopId: string | number) => `/shop/${shopId}/coupon/goods/list`,
    // 通知
    notificationsSummary: (shopId: string | number) => `/shop/${shopId}/notifications/summary`,
    notificationsList: (shopId: string | number) => `/shop/${shopId}/notifications`,
    notificationsReadAll: (shopId: string | number) => `/shop/${shopId}/notifications/read-all`,
    notificationsReadOne: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/notifications/${id}/read`,
    // 账户 / 提现
    accountInfo: (shopId: string | number) => `/shop/${shopId}/account/info`,
    balanceDetails: (shopId: string | number) => `/shop/${shopId}/balance/details`,
    withdrawList: (shopId: string | number) => `/shop/${shopId}/withdraw/list`,
    withdraw: (shopId: string | number) => `/shop/${shopId}/withdraw`,
    depositAccountInfo: (shopId: string | number) => `/shop/${shopId}/account/deposit/info`,
    depositList: (shopId: string | number) => `/shop/${shopId}/account/deposit/list`,
    agreements: (shopId: string | number) => `/shop/${shopId}/agreements`,
    merchantInfo: (shopId: string | number) => `/shop/${shopId}/merchant`,
    // 店铺基础信息
    shopInfo: (shopId: string | number) => `/shop/${shopId}/info`,
    shopShare: (shopId: string | number) => `/shop/${shopId}/share`,
    shopEeoReflect: (shopId: string | number) => `/shop/${shopId}/eeo/reflect`,
    shopClassinVersionLimit: (shopId: string | number) => `/shop/${shopId}/classin/version-limit`,
    // 成员管理
    membersList: (shopId: string | number) => `/shop/${shopId}/members`,
    memberPermissions: (shopId: string | number) => `/shop/${shopId}/member/permissions`,
    memberQuit: (shopId: string | number) => `/shop/${shopId}/member/quit`,
    memberRemove: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/members/${id}/remove`,
    memberUpdateRole: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/members/${id}/role`,
    memberUpdateName: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/members/${id}/name`,
    membersAddBatch: (shopId: string | number) => `/shop/${shopId}/members/batch`,
    // 角色权限
    rolesList: (shopId: string | number) => `/shop/${shopId}/roles`,
    rolePermissions: (shopId: string | number, roleId: string | number) =>
      `/shop/${shopId}/roles/${roleId}/permissions`,
    roleUpdate: (shopId: string | number, roleId: string | number) =>
      `/shop/${shopId}/roles/${roleId}`,
    roleDelete: (shopId: string | number, roleId: string | number) =>
      `/shop/${shopId}/roles/${roleId}/delete`,
    allPermissions: (shopId: string | number) => `/shop/${shopId}/permissions`,
    // 学员管理
    studentsList: (shopId: string | number) => `/shop/${shopId}/users/students`,
    studentUpdateName: (shopId: string | number, userId: string | number) =>
      `/shop/${shopId}/users/students/${userId}/name`,
    // 订单管理
    ordersList: (shopId: string | number) => `/shop/${shopId}/orders`,
    ordersSpecFilterOptions: (shopId: string | number) =>
      `/shop/${shopId}/orders/spec-filter-options`,
    ordersTrackingExport: (shopId: string | number) => `/shop/${shopId}/orders/tracking/export`,
    ordersTrackingImport: (shopId: string | number) => `/shop/${shopId}/orders/tracking/import`,
    orderTracking: (shopId: string | number, orderId: string | number) =>
      `/shop/${shopId}/orders/${orderId}/tracking`,
    // 商家退款（直接退款；POST 同路径发起退款）
    refundList: (shopId: string | number) => `/shop/${shopId}/refund`,
    refundCreate: (shopId: string | number) => `/shop/${shopId}/refund`,
    refundBookingPreviewShop: (shopId: string | number) => `/shop/${shopId}/refund/booking-preview`,
    // 退款申请（用户发起，商家审核）
    refundRequestList: (shopId: string | number) => `/shop/${shopId}/refund/requests`,
    refundRequestDetail: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/refund/requests/${id}`,
    refundRequestApprove: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/refund/requests/${id}/approve`,
    refundRequestReject: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/refund/requests/${id}/reject`,
    refundBookingPreview: (shopId: string | number) =>
      `/shop/${shopId}/refund/booking-preview`,
    // 装修
    decorationGet: (shopId: string | number) => `/shop/${shopId}/decoration`,
    decorationPages: (shopId: string | number) => `/shop/${shopId}/decoration/pages`,
    decorationPageDetail: (shopId: string | number, pageId: string | number) =>
      `/shop/${shopId}/decoration/pages/${pageId}`,
    decorationPublish: (shopId: string | number) => `/shop/${shopId}/decoration/publish`,
    decorationPageDelete: (shopId: string | number, pageId: string | number) =>
      `/shop/${shopId}/decoration/pages/${pageId}/delete`,
    decorationPageName: (shopId: string | number, pageId: string | number) =>
      `/shop/${shopId}/decoration/pages/${pageId}/name`,
    // 数据分析
    analyticsOverview: (shopId: string | number) => `/shop/${shopId}/analytics/overview`,
    analyticsTraffic: (shopId: string | number) => `/shop/${shopId}/analytics/traffic`,
    analyticsProducts: (shopId: string | number) => `/shop/${shopId}/analytics/products`,
    analyticsProductsList: (shopId: string | number) => `/shop/${shopId}/analytics/products/list`,
    analyticsUsers: (shopId: string | number) => `/shop/${shopId}/analytics/users`,
    analyticsUserPayDistribution: (shopId: string | number) =>
      `/shop/${shopId}/analytics/users/pay-distribution`,
    analyticsReport: (shopId: string | number) => `/shop/${shopId}/analytics/report`,
    // 约课分析
    analyticsBookingOverview: (shopId: string | number) =>
      `/shop/${shopId}/analytics/booking/overview`,
    analyticsBookingTrend: (shopId: string | number) => `/shop/${shopId}/analytics/booking/trend`,
    analyticsBookingTeacherSlotRank: (shopId: string | number) =>
      `/shop/${shopId}/analytics/booking/teacher-slot-rank`,
    analyticsBookingGoodsPerformance: (shopId: string | number) =>
      `/shop/${shopId}/analytics/booking/goods-performance`,
    analyticsBookingHeatmap: (shopId: string | number) =>
      `/shop/${shopId}/analytics/booking/heatmap`,
    analyticsBookingExport: (shopId: string | number) => `/shop/${shopId}/analytics/booking/export`,
    // 录播商品分析 & 资源用量
    analyticsRecordedOverview: (shopId: string | number) =>
      `/shop/${shopId}/analytics/recorded/overview`,
    analyticsRecordedGoods: (shopId: string | number) => `/shop/${shopId}/analytics/recorded/goods`,
    analyticsResourceUsageOverview: (shopId: string | number) =>
      `/shop/${shopId}/analytics/resource-usage/overview`,
    analyticsResourceUsageProducts: (shopId: string | number) =>
      `/shop/${shopId}/analytics/resource-usage/products`,
    recordedAnalyticsSummary: (shopId: string | number, goodsId: string | number) =>
      `/shop/${shopId}/recorded/${goodsId}/analytics/summary`,
    recordedAnalyticsStudents: (shopId: string | number, goodsId: string | number) =>
      `/shop/${shopId}/recorded/${goodsId}/analytics/students`,
    recordedAnalyticsActivities: (shopId: string | number, goodsId: string | number) =>
      `/shop/${shopId}/recorded/${goodsId}/analytics/activities`,
    // 概况页
    overviewOperation: (shopId: string | number) => `/shop/${shopId}/overview/operation`,
    overviewTodo: (shopId: string | number) => `/shop/${shopId}/overview/todo`,
    overviewGoods: (shopId: string | number) => `/shop/${shopId}/overview/goods`,
    overviewDynamics: (shopId: string | number) => `/shop/${shopId}/overview/dynamics`,
    overviewDynamicArticle: (shopId: string | number, articleId: string | number) =>
      `/shop/${shopId}/overview/dynamics/${articleId}`,
    // 营销活动
    activityMultiCourseList: (shopId: string | number) =>
      `/shop/${shopId}/activity/multi-course/list`,
    activityMultiCourseDetail: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/activity/multi-course/${id}`,
    activityMultiCourseCreate: (shopId: string | number) =>
      `/shop/${shopId}/activity/multi-course/create`,
    activityMultiCourseUpdate: (shopId: string | number) =>
      `/shop/${shopId}/activity/multi-course/update`,
    activityMultiCourseStatus: (shopId: string | number) =>
      `/shop/${shopId}/activity/multi-course/status`,
    activityMultiCourseDelete: (shopId: string | number) =>
      `/shop/${shopId}/activity/multi-course/delete`,
    activityGroupList: (shopId: string | number) => `/shop/${shopId}/activity/group/list`,
    activityGroupDetail: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/activity/group/${id}`,
    activityGroupCreate: (shopId: string | number) => `/shop/${shopId}/activity/group/create`,
    activityGroupUpdate: (shopId: string | number) => `/shop/${shopId}/activity/group/update`,
    activityGroupStatus: (shopId: string | number) => `/shop/${shopId}/activity/group/status`,
    activityGroupDelete: (shopId: string | number) => `/shop/${shopId}/activity/group/delete`,
    activityGroupShare: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/activity/group/${id}/share`,
    activityLimitedTimeDiscountList: (shopId: string | number) =>
      `/shop/${shopId}/activity/limited-time-discount/list`,
    activityLimitedTimeDiscountDetail: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/activity/limited-time-discount/${id}`,
    activityLimitedTimeDiscountCreate: (shopId: string | number) =>
      `/shop/${shopId}/activity/limited-time-discount/create`,
    activityLimitedTimeDiscountUpdate: (shopId: string | number) =>
      `/shop/${shopId}/activity/limited-time-discount/update`,
    activityLimitedTimeDiscountStatus: (shopId: string | number) =>
      `/shop/${shopId}/activity/limited-time-discount/status`,
    activityLimitedTimeDiscountShare: (shopId: string | number, id: string | number) =>
      `/shop/${shopId}/activity/limited-time-discount/${id}/share`,
    // 分销
    distributionGoodsList: (shopId: string | number) =>
      `/shop/${shopId}/distribution/goods/list`,
    distributionGoodsToAddList: (shopId: string | number) =>
      `/shop/${shopId}/distribution/goods/list/to_add`,
    distributionOrder: (shopId: string | number) => `/shop/${shopId}/distribution/order`,
    distributionPromotion: (shopId: string | number) => `/shop/${shopId}/distribution/promotion`,
    promotionGoods: (shopId: string | number) => `/shop/${shopId}/spread/goods`,
    promotionGoodsInfo: (shopId: string | number) => `/shop/${shopId}/spread/goods/info`,
    promotionMerchants: (shopId: string | number) => `/shop/${shopId}/spread/merchants`,
    promotionInfo: (shopId: string | number) => `/shop/${shopId}/spread/info`,
    // 推广员
    salersList: (shopId: string | number) => `/shop/${shopId}/salers`,
  },
} as const;
