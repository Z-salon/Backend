import { staffService } from './staff.service';

export interface ProposedScheduleInput {
  dayOfWeek?: number;
  date?: string;
  isWorking: boolean;
  intervals: { start: string; end: string }[];
}

export class StaffValidationService {
  /**
   * Checks for future appointment conflicts with the proposed schedule.
   * This is a stub for now — connect to Appointment module when implemented.
   */
  private async checkAppointmentConflicts(staffId: string, proposed: ProposedScheduleInput): Promise<any[]> {
    // TODO: When the Appointment module is implemented, plug in this logic:
    //   1. Fetch future appointments for staffId on the affected day/date.
    //   2. For each appointment, check if its time falls outside proposed.intervals.
    //   3. Return affected appointments with reason = 'OUTSIDE_PROPOSED_WORKING_HOURS'.
    return [];
  }

  async validateProposedSchedule(businessId: string, staffId: string, userId: string, proposed: ProposedScheduleInput) {
    // Validates actor has access to this staff member
    await staffService.getStaffDetails(businessId, staffId, userId);

    const conflicts = await this.checkAppointmentConflicts(staffId, proposed);

    return {
      valid: conflicts.length === 0,
      affectedAppointments: conflicts,
    };
  }
}

export const staffValidationService = new StaffValidationService();
