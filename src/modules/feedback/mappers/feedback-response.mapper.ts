import { Prisma } from '@prisma/client';

/**
 * Shared include used by every admin-facing feedback query.
 * Keeping it in one place means the privacy mapper can never receive a shape it
 * does not expect.
 */
export const FEEDBACK_SUBMISSION_INCLUDE = {
  feedbackRequest: {
    select: {
      id: true,
      businessId: true,
      expiresAt: true,
      sentAt: true,
      status: true,
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phones: {
            where: { isPrimary: true },
            take: 1,
            select: { phone: true },
          },
        },
      },
      appointment: {
        select: {
          id: true,
          scheduledStart: true,
          scheduledEnd: true,
          status: true,
          branch: { select: { id: true, name: true } },
          service: { select: { id: true, name: true } },
          staff: {
            select: {
              staff: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  },
  responses: {
    select: {
      id: true,
      ratingValue: true,
      textResponse: true,
      booleanResponse: true,
      createdAt: true,
      feedbackCategory: { select: { id: true, name: true, type: true } },
    },
  },
} satisfies Prisma.FeedbackSubmissionInclude;

type FeedbackSubmissionWithRelations = Prisma.FeedbackSubmissionGetPayload<{
  include: typeof FEEDBACK_SUBMISSION_INCLUDE;
}>;

/**
 * Serialize a feedback submission for an authorized OWNER/ADMIN.
 *
 * This is the ONLY place admin feedback is shaped. Both the list and the detail
 * endpoint use it, so an anonymous submission can never leak identifying context
 * through a newly added endpoint or nested relation.
 */
export function toAdminFeedbackResponse(submission: FeedbackSubmissionWithRelations) {
  const responses = submission.responses.map((response) => ({
    id: response.id,
    category: {
      id: response.feedbackCategory.id,
      name: response.feedbackCategory.name,
      type: response.feedbackCategory.type,
    },
    rating_value: response.ratingValue,
    text_response: response.textResponse,
    boolean_response: response.booleanResponse,
    answered_at: response.createdAt,
  }));

  const base = {
    id: submission.id,
    is_anonymous: submission.isAnonymous,
    submitted_at: submission.submittedAt,
    responses,
  };

  if (submission.isAnonymous) {
    // Anonymous feedback hides the customer AND all appointment context
    // (appointment, branch, staff, service) at the serialization boundary.
    return {
      ...base,
      customer: null,
      appointment: null,
    };
  }

  const request = submission.feedbackRequest;
  const appointment = request.appointment;
  const primaryPhone = request.customer.phones[0]?.phone ?? null;

  return {
    ...base,
    customer: {
      id: request.customer.id,
      first_name: request.customer.firstName,
      last_name: request.customer.lastName,
      phone: primaryPhone,
    },
    appointment: appointment
      ? {
          id: appointment.id,
          scheduled_start: appointment.scheduledStart,
          scheduled_end: appointment.scheduledEnd,
          status: appointment.status,
          branch: appointment.branch ? { id: appointment.branch.id, name: appointment.branch.name } : null,
          service: appointment.service ? { id: appointment.service.id, name: appointment.service.name } : null,
          staff: appointment.staff.map((entry) => ({
            id: entry.staff.id,
            first_name: entry.staff.firstName,
            last_name: entry.staff.lastName,
          })),
        }
      : null,
  };
}

export type AdminFeedbackResponse = ReturnType<typeof toAdminFeedbackResponse>;
