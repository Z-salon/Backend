"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("../modules/auth/routes/auth.routes"));
const invitation_routes_1 = __importDefault(require("../modules/invitation/routes/invitation.routes"));
const member_routes_1 = __importDefault(require("../modules/business/routes/member.routes"));
const role_routes_1 = __importDefault(require("../modules/role/routes/role.routes"));
const business_configuration_routes_1 = __importDefault(require("../modules/business/routes/business-configuration.routes"));
const branch_routes_1 = __importDefault(require("../modules/business/routes/branch.routes"));
const service_category_routes_1 = __importDefault(require("../modules/services/routes/service-category.routes"));
const service_routes_1 = __importDefault(require("../modules/services/routes/service.routes"));
const staff_routes_1 = __importDefault(require("../modules/staff/routes/staff.routes"));
const customer_routes_1 = __importDefault(require("../modules/customer/routes/customer.routes"));
const availability_routes_1 = __importDefault(require("../modules/services/routes/availability.routes"));
const appointment_routes_1 = __importDefault(require("../modules/appointment/routes/appointment.routes"));
const customer_appointment_routes_1 = __importDefault(require("../modules/customer/routes/customer-appointment.routes"));
const public_booking_routes_1 = __importDefault(require("../modules/appointment/routes/public-booking.routes"));
const router = (0, express_1.Router)();
router.use(`/auth`, auth_routes_1.default);
router.use(`/`, invitation_routes_1.default);
router.use(`/`, member_routes_1.default);
router.use(`/`, role_routes_1.default);
router.use(`/`, business_configuration_routes_1.default);
router.use(`/`, branch_routes_1.default);
router.use(`/`, service_category_routes_1.default);
router.use(`/`, service_routes_1.default);
router.use(`/`, staff_routes_1.default);
router.use(`/`, customer_routes_1.default);
router.use(`/`, availability_routes_1.default);
router.use(`/`, appointment_routes_1.default);
router.use(`/customer`, customer_appointment_routes_1.default);
router.use(`/public`, public_booking_routes_1.default);
/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Check API health
 *     responses:
 *       200: { description: API is healthy }
 */
router.get('/health', (req, res) => {
    res.json({ success: true, message: 'OK', timestamp: new Date().toISOString() });
});
exports.default = router;
