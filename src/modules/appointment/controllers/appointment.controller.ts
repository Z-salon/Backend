import { Request, Response, NextFunction } from 'express';
import { appointmentService } from '../services/appointment.service';
import { appointmentMatchingService } from '../services/appointment-matching.service';
import { successResponse } from '../../../utils/api-response';
import { normalizePhone } from '../../../utils/phone';

export class AppointmentController {
  /**
   * Create an appointment (online booking by customer)
   */
  async createAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;
      const { branchId, customerId, serviceId, staffId, scheduledStart, scheduledEnd, notes, internalNotes } = req.body;

      const appointment = await appointmentService.createAppointment(
        {
          businessId,
          branchId,
          customerId,
          serviceId,
          staffId,
          scheduledStart: new Date(scheduledStart),
          scheduledEnd: new Date(scheduledEnd),
          notes,
          internalNotes,
          bookingSource: 'ONLINE',
          createdById: userId,
        },
        userId
      );

      res.status(201).json(successResponse('Appointment created successfully', appointment));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Staff-assisted booking (PHONE or STAFF source)
   */
  async createStaffBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;
      const { branchId, customerId, serviceId, staffId, scheduledStart, scheduledEnd, notes, internalNotes, bookingSource } = req.body;

      const appointment = await appointmentService.createAppointment(
        {
          businessId,
          branchId,
          customerId,
          serviceId,
          staffId,
          scheduledStart: new Date(scheduledStart),
          scheduledEnd: new Date(scheduledEnd),
          notes,
          internalNotes,
          bookingSource: bookingSource === 'PHONE' ? 'PHONE' : 'STAFF',
          createdById: userId,
        },
        userId
      );

      res.status(201).json(successResponse('Appointment created successfully', appointment));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Walk-in appointment creation
   */
  async createWalkIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;
      const { branchId, customerId, serviceId, staffId, scheduledStart, scheduledEnd, notes, internalNotes } = req.body;

      const appointment = await appointmentService.createAppointment(
        {
          businessId,
          branchId,
          customerId,
          serviceId,
          staffId,
          scheduledStart: new Date(scheduledStart),
          scheduledEnd: new Date(scheduledEnd),
          notes,
          internalNotes,
          bookingSource: 'WALK_IN',
          createdById: userId,
        },
        userId
      );

      res.status(201).json(successResponse('Walk-in appointment created successfully', appointment));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Find or create customer by phone (for walk-in/phone booking)
   */
  async matchCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const { phone } = req.body;

      const normalizedPhone = normalizePhone(phone);
      const match = await appointmentService.findOrCreateCustomer(businessId, req.auth!.userId, {
        firstName: req.body.firstName || '',
        lastName: req.body.lastName || '',
        phone: normalizedPhone,
      });

      res.json(successResponse(match.isNew ? 'Customer created' : 'Customer found', match));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Match customer by phone (for walk-in/phone lookup)
   */
  async matchCustomerByPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const { phone } = req.body;

      const normalizedPhone = normalizePhone(phone);
      const match = await appointmentService.matchCustomerByPhone(businessId, normalizedPhone);

      res.json(successResponse(match.matched ? 'Customer found' : 'No customer found', match));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get appointment by ID
   */
  async getAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const appointmentId = req.params.appointmentId;
      const userId = req.auth!.userId;

      const appointment = await appointmentService.getAppointmentById(appointmentId, businessId);

      res.json(successResponse('Appointment retrieved successfully', appointment));
    } catch (error) {
      next(error);
    }
  }

  /**
   * List appointments with filters
   */
  async getAppointments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;
      const query = req.query;

      const result = await appointmentService.getAppointments(businessId, userId, {
        branchId: query.branchId as string,
        customerId: query.customerId as string,
        serviceId: query.serviceId as string,
        staffId: query.staffId as string,
        status: query.status as any,
        bookingSource: query.bookingSource as any,
        startDate: query.startDate as string,
        endDate: query.endDate as string,
        page: parseInt(query.page as string) || 1,
        limit: parseInt(query.limit as string) || 20,
      });

      res.json(successResponse('Appointments retrieved successfully', result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update appointment (reschedule, change staff, add notes)
   */
  async updateAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const appointmentId = req.params.appointmentId;
      const userId = req.auth!.userId;

      const appointment = await appointmentService.updateAppointment(appointmentId, businessId, userId, req.body);

      res.json(successResponse('Appointment updated successfully', appointment));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reschedule appointment
   */
  async rescheduleAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const appointmentId = req.params.appointmentId;
      const userId = req.auth!.userId;
      const { newStartTime, reason, staffId } = req.body;

      if (!newStartTime) {
        res.status(400).json({ success: false, message: 'newStartTime is required' });
        return;
      }

      const appointment = await appointmentService.rescheduleBusinessAppointment(
        businessId, userId, appointmentId, new Date(newStartTime), reason, staffId
      );

      res.json(successResponse('Appointment rescheduled successfully', appointment));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Change appointment service
   */
  async editService(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const appointmentId = req.params.appointmentId;
      const userId = req.auth!.userId;
      const { serviceId } = req.body;

      if (!serviceId) {
        res.status(400).json({ success: false, message: 'serviceId is required' });
        return;
      }

      const appointment = await appointmentService.editService(
        businessId, userId, appointmentId, serviceId
      );

      res.json(successResponse('Appointment service updated successfully', appointment));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel appointment
   */
  async cancelAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const appointmentId = req.params.appointmentId;
      const userId = req.auth!.userId;
      const { reason } = req.body;

      const appointment = await appointmentService.cancelAppointment(
        businessId, userId, appointmentId, reason
      );

      res.json(successResponse('Appointment cancelled successfully', appointment));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Transition appointment status
   */
  async transitionStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const appointmentId = req.params.appointmentId;
      const userId = req.auth!.userId;
      const { status, reason } = req.body;

      const appointment = await appointmentService.transitionStatus(appointmentId, businessId, userId, status, reason);

      res.json(successResponse('Appointment status updated successfully', appointment));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get appointment status history
   */
  async getStatusHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const appointmentId = req.params.appointmentId;
      const businessId = req.params.businessId;
      const userId = req.auth!.userId;

      const history = await appointmentService.getStatusHistory(appointmentId, businessId, userId);

      res.json(successResponse('Status history retrieved successfully', history));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Assign staff to appointment
   */
  async assignStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const appointmentId = req.params.appointmentId;
      const userId = req.auth!.userId;
      const { staffId } = req.body;

      const appointment = await appointmentService.assignStaff(appointmentId, businessId, userId, staffId);

      res.json(successResponse('Staff assigned successfully', appointment));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unassign staff from appointment
   */
  async unassignStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.params.businessId;
      const appointmentId = req.params.appointmentId;
      const userId = req.auth!.userId;

      const appointment = await appointmentService.unassignStaff(appointmentId, businessId, userId);

      res.json(successResponse('Staff unassigned successfully', appointment));
    } catch (error) {
      next(error);
    }
  }
}

export const appointmentController = new AppointmentController();