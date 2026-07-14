import { Router } from 'express'
import { register, login, getMe, findId, requestPasswordReset, resetPassword, updateEmailNotifications, updateProfile, requestPhoneOtp, verifyPhoneOtpAndReset, verifyEmail, resendVerificationEmail, refreshTokens, logout } from '../controllers/auth.controller'
import { setup2FA, confirm2FA, disable2FA, get2FAStatus } from '../controllers/twofa.controller'
import { createDispute, getDispute, getMyDisputes, adminGetDisputes, adminResolveDispute } from '../controllers/dispute.controller'
import { calculateSellerGrade } from '../lib/fraudDetection'
import { prisma } from '../lib/prisma'
import {
  getListings,
  getListing,
  createListing,
  buyNow,
  placeBid,
  makeOffer,
  respondToOffer,
  getMarketSummary,
  setAutoBid,
  cancelAutoBid,
  getAutoBid,
} from '../controllers/listing.controller'
import { getOripaList, getOripa, getOripaHistory, drawOripa } from '../controllers/oripa.controller'
import { getInventory, deleteInventoryItem } from '../controllers/inventory.controller'
import {
  createWithdrawal, getMyWithdrawals, cancelWithdrawal,
  getAdminWithdrawals, processWithdrawal, executeTransfer,
} from '../controllers/withdrawal.controller'
import {
  createShippingRequest, getMyShippingRequests, cancelShippingRequest,
  getAdminShippings, updateShippingStatus,
} from '../controllers/shipping.controller'
import {
  getMyListings, cancelListing,
  getMyPurchases, getMySales,
  getReceivedOffers, getSentOffers, withdrawOffer,
  getMyBids, getMyOripaHistory, getMyStats,
} from '../controllers/my.controller'
import {
  getStats,
  getCards, createCard, updateCard, deleteCard, deleteAllCards,
  getOripas, createOripa, updateOripa, toggleOripa, addOripaItem, removeOripaItem,
  getUsers, grantBalance, setUserRole, resetUserPassword,
  getMyPermissions, getSubAdmins, updateUserPermissions,
} from '../controllers/admin.controller'
import { authenticate, optionalAuth, requireAdmin, requireSuperAdmin } from '../middleware/auth'
import { requireSection } from '../middleware/permissions'
import { searchCards, getCardMeta, getCardRank, getCard, getCardVariants, getCardListings, getCardPriceHistory } from '../controllers/card.controller'
import { proxyImage } from '../controllers/imageProxy.controller'
import { upload } from '../middleware/upload'
import { uploadImage } from '../controllers/upload.controller'
import { confirmPayment } from '../controllers/payment.controller'
import {
  getTcgdexSets, importTcgdex,
  getPokemonSets, importPokemon,
  importAllJapanesePokemon,
  enrichPokemonKoNames, enrichPokemonJaNames,
  getYugiohSets, importYugioh, importYugiohAll,
  getMtgSets, importMtg,
  importDigimon,
  getOnePieceSets, importOnePiece,
  enrichOnePieceRarities,
  fixOnePieceNames,
  importOnePieceParallels,
  importOnePieceParallelsFromBandai,
  importAllOnePieceSets,
  enrichOnePieceDetails,
  mergeLanguageDuplicates,
  importAll,
} from '../controllers/import.controller'
import { authLimiter, paymentLimiter, uploadLimiter, apiLimiter } from '../middleware/rateLimit'
import {
  getShopItems, getShopItem, buyShopItem, getMyShopOrders,
  adminGetShopItems, adminCreateShopItem, adminUpdateShopItem, adminDeleteShopItem, adminRestockShopItem, adminToggleSoldOut,
  adminGetShopStats, adminGetShopOrders, adminUpdateShopOrderShipping,
} from '../controllers/shop.controller'
import { getOrCreateRoom, getMyRooms, getRoomMessages, getUnreadCount } from '../controllers/chat.controller'
import { shipItem, confirmReceipt, adminReleaseEscrow, getCarriers } from '../controllers/escrow.controller'
import { getMenus, toggleMenu, updateMenuOrder } from '../controllers/menu.controller'
import { getMaintenanceStatus, updateMaintenance } from '../controllers/siteConfig.controller'
import { getPosts, getPost, addComment, deleteComment, togglePostLike, toggleCommentLike, userCreatePost, userUpdatePost, userDeletePost, adminCreatePost, adminUpdatePost, adminDeletePost, adminTogglePin } from '../controllers/post.controller'
import { createReport, getMyReports, getAdminReports, updateReport } from '../controllers/report.controller'
import { createReview, getUserReviews, getUserProfile, getMyPendingReviews, replyToReview } from '../controllers/review.controller'
import { getNotifications, getUnreadCount as getNotifUnreadCount, markRead, markAllRead, deleteNotification } from '../controllers/notification.controller'
import { getMyWishlist, getWishlistStatus, upsertWishlist, removeWishlist } from '../controllers/wishlist.controller'
import { getMyCollectionSummary, getMyCollectionSet } from '../controllers/collection.controller'
import { searchNaverShop, getNaverPriceRef } from '../controllers/naverShopping.controller'
import {
  sendFriendRequest, respondFriendRequest,
  getFriendRequests, getSentRequests, getFriends, removeFriend,
  getPendingRequestCount, getFriendStatus, searchUsers,
  getOrCreateDmRoom, getMyDmRooms, getDmMessages, getDmRoomDetail,
} from '../controllers/friend.controller'

const router = Router()

// 헬스체크
router.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString() })
  }
})

// 인증
router.post('/auth/register', authLimiter, register)
router.post('/auth/login', authLimiter, login)
router.get('/auth/me', authenticate, getMe)
router.post('/auth/find-id', authLimiter, findId)
router.post('/auth/forgot-password', authLimiter, requestPasswordReset)
router.post('/auth/reset-password', authLimiter, resetPassword)
router.post('/auth/request-phone-otp', authLimiter, requestPhoneOtp)
router.post('/auth/verify-phone-otp', authLimiter, verifyPhoneOtpAndReset)
router.patch('/auth/email-notifications', authenticate, updateEmailNotifications)
router.patch('/auth/profile', authenticate, updateProfile)
router.get('/auth/verify-email/:token', verifyEmail)
router.post('/auth/resend-verification', authenticate, resendVerificationEmail)
router.post('/auth/refresh', refreshTokens)
router.post('/auth/logout', logout)

// 2단계 인증 (TOTP)
router.get('/auth/2fa/status', authenticate, get2FAStatus)
router.post('/auth/2fa/setup', authenticate, setup2FA)
router.post('/auth/2fa/confirm', authenticate, confirm2FA)
router.post('/auth/2fa/disable', authenticate, disable2FA)

// 분쟁 해결
router.post('/disputes', authenticate, createDispute)
router.get('/disputes', authenticate, getMyDisputes)
router.get('/disputes/:id', authenticate, getDispute)

// 카드 검색 (공개)
router.get('/cards/meta', getCardMeta)
router.get('/cards/rank', getCardRank)
router.get('/cards', searchCards)
router.get('/cards/:id', getCard)
router.get('/cards/:id/variants', getCardVariants)
router.get('/cards/:id/price-history', getCardPriceHistory)
router.get('/cards/:id/listings', getCardListings)

// 이미지 프록시 (외부 이미지 핫링크 차단 우회)
router.get('/proxy/image', proxyImage)

// 이미지 업로드
router.post('/upload', authenticate, uploadLimiter, upload.single('file'), uploadImage)

// 결제 (토스페이먼츠)
router.post('/payments/confirm', authenticate, paymentLimiter, confirmPayment)

// 리스팅
router.get('/listings/market-summary', getMarketSummary)
router.get('/listings', getListings)
router.get('/listings/:id', getListing)
router.post('/listings', authenticate, createListing)
router.post('/listings/:id/buy', authenticate, buyNow)
router.post('/listings/:id/bid', authenticate, placeBid)
router.get('/listings/:id/auto-bid', authenticate, getAutoBid)
router.post('/listings/:id/auto-bid', authenticate, setAutoBid)
router.delete('/listings/:id/auto-bid', authenticate, cancelAutoBid)
router.post('/listings/:id/offer', authenticate, makeOffer)
router.patch('/offers/:offerId/respond', authenticate, respondToOffer)

// 샵 (관리자 판매 TCG 박스)
router.get('/shop', getShopItems)
router.get('/shop/:id', getShopItem)
router.post('/shop/:id/buy', authenticate, buyShopItem)
router.get('/my/shop-orders', authenticate, getMyShopOrders)
router.get('/admin/shop/stats',                    authenticate, requireSection('shop'), adminGetShopStats)
router.get('/admin/shop/orders',                   authenticate, requireSection('shop'), adminGetShopOrders)
router.patch('/admin/shop/orders/:id/shipping',    authenticate, requireSection('shop'), adminUpdateShopOrderShipping)
router.get('/admin/shop',                authenticate, requireSection('shop'), adminGetShopItems)
router.post('/admin/shop',           authenticate, requireSection('shop'), adminCreateShopItem)
router.patch('/admin/shop/:id',      authenticate, requireSection('shop'), adminUpdateShopItem)
router.delete('/admin/shop/:id',     authenticate, requireSection('shop'), adminDeleteShopItem)
router.post('/admin/shop/:id/restock',   authenticate, requireSection('shop'), adminRestockShopItem)
router.patch('/admin/shop/:id/soldout', authenticate, requireSection('shop'), adminToggleSoldOut)

// 오리파
router.get('/oripas', getOripaList)
router.get('/oripas/:id', getOripa)
router.get('/oripas/:id/history', getOripaHistory)
router.post('/oripas/:id/draw', authenticate, drawOripa)

// 마이페이지
router.get('/my/stats', authenticate, getMyStats)
router.get('/my/listings', authenticate, getMyListings)
router.delete('/my/listings/:id', authenticate, cancelListing)
router.get('/my/purchases', authenticate, getMyPurchases)
router.get('/my/sales', authenticate, getMySales)
router.get('/my/offers/received', authenticate, getReceivedOffers)
router.get('/my/offers/sent', authenticate, getSentOffers)
router.delete('/my/offers/:id', authenticate, withdrawOffer)
router.get('/my/bids', authenticate, getMyBids)
router.get('/my/oripas', authenticate, getMyOripaHistory)

// 채팅
router.post('/chat/listings/:listingId', authenticate, getOrCreateRoom)
router.get('/chat/rooms', authenticate, getMyRooms)
router.get('/chat/rooms/:roomId/messages', authenticate, getRoomMessages)
router.get('/chat/unread', authenticate, getUnreadCount)

// 거래 (번개장터식)
router.get('/carriers', getCarriers)
router.post('/transactions/:id/ship', authenticate, shipItem)
router.post('/transactions/:id/confirm', authenticate, confirmReceipt)
router.post('/admin/transactions/:id/release', authenticate, requireSuperAdmin, adminReleaseEscrow)

// 인벤토리
router.get('/my/inventory', authenticate, getInventory)
router.delete('/my/inventory/:id', authenticate, deleteInventoryItem)

// 배송 신청
router.get('/my/shipping', authenticate, getMyShippingRequests)
router.post('/my/shipping', authenticate, createShippingRequest)
router.patch('/my/shipping/:id/cancel', authenticate, cancelShippingRequest)

// 관리자 — 공통 (ADMIN + SUPER_ADMIN)
router.get('/admin/stats',          authenticate, requireAdmin, getStats)
router.get('/admin/my-permissions', authenticate, requireAdmin, getMyPermissions)

// 관리자 — 카드
router.get('/admin/cards',        authenticate, requireSection('cards'), getCards)
router.post('/admin/cards',       authenticate, requireSection('cards'), createCard)
router.patch('/admin/cards/:id',  authenticate, requireSection('cards'), updateCard)
router.delete('/admin/cards',     authenticate, requireSection('cards'), deleteAllCards)
router.delete('/admin/cards/:id', authenticate, requireSection('cards'), deleteCard)

// 관리자 — 오리파
router.get('/admin/oripas',                      authenticate, requireSection('oripas'), getOripas)
router.post('/admin/oripas',                     authenticate, requireSection('oripas'), createOripa)
router.patch('/admin/oripas/:id',                authenticate, requireSection('oripas'), updateOripa)
router.patch('/admin/oripas/:id/toggle',         authenticate, requireSection('oripas'), toggleOripa)
router.post('/admin/oripas/:id/items',           authenticate, requireSection('oripas'), addOripaItem)
router.delete('/admin/oripas/:id/items/:itemId', authenticate, requireSection('oripas'), removeOripaItem)

// 관리자 — 유저 (SUPER_ADMIN 전용)
router.get('/admin/users',                     authenticate, requireSuperAdmin, getUsers)
router.post('/admin/users/:id/grant',          authenticate, requireSuperAdmin, grantBalance)
router.patch('/admin/users/:id/role',          authenticate, requireSuperAdmin, setUserRole)
router.post('/admin/users/:id/reset-password', authenticate, requireSuperAdmin, resetUserPassword)

// 관리자 — 중간 관리자 권한 관리 (SUPER_ADMIN 전용)
router.get('/admin/sub-admins',                    authenticate, requireSuperAdmin, getSubAdmins)
router.put('/admin/users/:id/permissions',         authenticate, requireSuperAdmin, updateUserPermissions)

// 환전 신청
router.post('/my/withdrawal', authenticate, createWithdrawal)
router.get('/my/withdrawal', authenticate, getMyWithdrawals)
router.patch('/my/withdrawal/:id/cancel', authenticate, cancelWithdrawal)

// 관리자 환전 관리
router.get('/admin/withdrawal',               authenticate, requireSection('withdrawal'), getAdminWithdrawals)
router.patch('/admin/withdrawal/:id',         authenticate, requireSection('withdrawal'), processWithdrawal)
router.post('/admin/withdrawal/:id/transfer', authenticate, requireSection('withdrawal'), executeTransfer)

// 관리자 배송 관리
router.get('/admin/shipping',    authenticate, requireSection('shipping'), getAdminShippings)
router.patch('/admin/shipping/:id', authenticate, requireSection('shipping'), updateShippingStatus)

// 관리자 분쟁 관리
router.get('/admin/disputes',         authenticate, requireAdmin, adminGetDisputes)
router.patch('/admin/disputes/:id',   authenticate, requireAdmin, adminResolveDispute)

// 셀러 등급 (공개)
router.get('/users/:id/seller-grade', async (req, res) => {
  try {
    const grade = await calculateSellerGrade(req.params['id'])
    res.json({ grade })
  } catch {
    res.status(500).json({ message: '서버 오류' })
  }
})

// 사이트 설정 (점검 모드)
router.get('/site-config/maintenance', getMaintenanceStatus)
router.patch('/admin/site-config/maintenance', authenticate, requireSuperAdmin, updateMaintenance)

// 메뉴 설정 (SUPER_ADMIN 전용)
router.get('/menus', getMenus)
router.patch('/admin/menus/order',      authenticate, requireSuperAdmin, updateMenuOrder)
router.patch('/admin/menus/:key/toggle', authenticate, requireSuperAdmin, toggleMenu)

// 게시판
router.get('/posts',                                   getPosts)
router.get('/posts/:id',                               optionalAuth, getPost)
router.post('/posts',                                  authenticate, apiLimiter, userCreatePost)
router.patch('/posts/:id',                             authenticate, userUpdatePost)
router.delete('/posts/:id',                            authenticate, userDeletePost)
router.post('/posts/:id/like',                         authenticate, togglePostLike)
router.post('/posts/:id/comments',                     authenticate, apiLimiter, addComment)
router.delete('/posts/:id/comments/:commentId',        authenticate, deleteComment)
router.post('/posts/:id/comments/:commentId/like',     authenticate, toggleCommentLike)
router.post('/admin/posts',            authenticate, requireSection('posts'), adminCreatePost)
router.patch('/admin/posts/:id',       authenticate, requireSection('posts'), adminUpdatePost)
router.patch('/admin/posts/:id/pin',   authenticate, requireSection('posts'), adminTogglePin)
router.delete('/admin/posts/:id',      authenticate, requireSection('posts'), adminDeletePost)

// 네이버 쇼핑 API
router.get('/admin/naver-shopping/search', authenticate, requireAdmin, searchNaverShop)
router.get('/naver-price-ref',             optionalAuth, getNaverPriceRef)

// 친구
router.get ('/users/search',                     authenticate, apiLimiter, searchUsers)
router.get ('/friends',                          authenticate, getFriends)
router.get ('/friends/requests',                 authenticate, getFriendRequests)
router.get ('/friends/requests/sent',            authenticate, getSentRequests)
router.get ('/friends/requests/count',           authenticate, getPendingRequestCount)
router.post('/friends/requests/:userId',         authenticate, apiLimiter, sendFriendRequest)
router.patch('/friends/requests/:requestId',     authenticate, respondFriendRequest)
router.delete('/friends/:userId',               authenticate, removeFriend)
router.get ('/friends/status/:userId',           authenticate, getFriendStatus)
router.get ('/dm/rooms',                         authenticate, getMyDmRooms)
router.get ('/dm/rooms/:roomId',                 authenticate, getDmRoomDetail)
router.get ('/dm/with/:userId',                  authenticate, getOrCreateDmRoom)
router.get ('/dm/rooms/:roomId/messages',        authenticate, getDmMessages)

// 신고
router.post('/reports',              authenticate, apiLimiter, createReport)
router.get('/my/reports',            authenticate, getMyReports)
router.get('/admin/reports',         authenticate, requireSection('reports'), getAdminReports)
router.patch('/admin/reports/:id',   authenticate, requireSection('reports'), updateReport)

// 리뷰 & 평점
router.post('/reviews',                    authenticate, apiLimiter, createReview)
router.post('/reviews/:id/reply',          authenticate, apiLimiter, replyToReview)
router.get('/reviews/pending',             authenticate, getMyPendingReviews)
router.get('/users/:userId/profile',       getUserProfile)
router.get('/users/:userId/reviews',       getUserReviews)

// 위시리스트
router.get('/my/wishlist',                 authenticate, getMyWishlist)
router.post('/wishlist',                   authenticate, upsertWishlist)
router.get('/wishlist/status/:cardId',     authenticate, getWishlistStatus)
router.patch('/wishlist/:cardId',          authenticate, upsertWishlist)
router.delete('/wishlist/:cardId',         authenticate, removeWishlist)

// 컬렉션 트래커
router.get('/my/collection',                       authenticate, getMyCollectionSummary)
router.get('/my/collection/:tcgType/:setName',     authenticate, getMyCollectionSet)

// 알림
router.get('/notifications',               authenticate, getNotifications)
router.get('/notifications/unread-count',  authenticate, getNotifUnreadCount)
router.patch('/notifications/read-all',    authenticate, markAllRead)
router.patch('/notifications/:id/read',    authenticate, markRead)
router.delete('/notifications/:id',        authenticate, deleteNotification)

// 외부 API 카드 임포트 (SUPER_ADMIN 전용)
router.get('/admin/import/tcgdex/sets',    authenticate, requireSuperAdmin, getTcgdexSets)
router.post('/admin/import/tcgdex',        authenticate, requireSuperAdmin, importTcgdex)
router.get('/admin/import/pokemon/sets',   authenticate, requireSuperAdmin, getPokemonSets)
router.post('/admin/import/pokemon',            authenticate, requireSuperAdmin, importPokemon)
router.get('/admin/import/pokemon/ja-all',      authenticate, requireSuperAdmin, importAllJapanesePokemon)
router.post('/admin/import/pokemon/enrich-ko',  authenticate, requireSuperAdmin, enrichPokemonKoNames)
router.post('/admin/import/pokemon/enrich-ja', authenticate, requireSuperAdmin, enrichPokemonJaNames)
router.get('/admin/import/yugioh/sets',    authenticate, requireSuperAdmin, getYugiohSets)
router.post('/admin/import/yugioh',        authenticate, requireSuperAdmin, importYugioh)
router.get('/admin/import/mtg/sets',       authenticate, requireSuperAdmin, getMtgSets)
router.post('/admin/import/mtg',           authenticate, requireSuperAdmin, importMtg)
router.post('/admin/import/digimon',       authenticate, requireSuperAdmin, importDigimon)
router.get('/admin/import/onepiece/sets',          authenticate, requireSuperAdmin, getOnePieceSets)
router.post('/admin/import/onepiece',              authenticate, requireSuperAdmin, importOnePiece)
router.get('/admin/import/onepiece/enrich-rarity', authenticate, requireSuperAdmin, enrichOnePieceRarities)
router.get('/admin/import/onepiece/fix-names',     authenticate, requireSuperAdmin, fixOnePieceNames)
router.get('/admin/import/onepiece/parallels',        authenticate, requireSuperAdmin, importOnePieceParallels)
router.get('/admin/import/onepiece/parallels-bandai', authenticate, requireSuperAdmin, importOnePieceParallelsFromBandai)
router.get('/admin/import/onepiece/import-all',       authenticate, requireSuperAdmin, importAllOnePieceSets)
router.get('/admin/import/onepiece/enrich-details',   authenticate, requireSuperAdmin, enrichOnePieceDetails)
router.post('/admin/import/merge-duplicates', authenticate, requireSuperAdmin, mergeLanguageDuplicates)
router.post('/admin/import/yugioh-all',    authenticate, requireSuperAdmin, importYugiohAll)
router.post('/admin/import/all',           authenticate, requireSuperAdmin, importAll)

export default router
