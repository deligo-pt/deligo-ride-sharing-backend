import prisma from '../../config/db';
import { BroadcastNotificationInput } from './admin.notification.validation';
import { NotificationEngine } from '../notification/notification.service';

export const broadcastNotification = async (payload: BroadcastNotificationInput) => {
  const where = payload.targetRole === 'ALL' ? {} : { role: payload.targetRole };

  // Fetch all users matching the role
  // For a large system, this should be paginated or queued in a background job like BullMQ
  // Given current scale, we will just fetch and iterate
  const users = await prisma.user.findMany({
    where,
    select: { id: true },
  });

  let sentCount = 0;

  for (const user of users) {
    void NotificationEngine.dispatch({
      userId: user.id,
      type: 'SYSTEM',
      title: payload.title,
      message: payload.message,
    });
    sentCount++;
  }

  return { success: true, sentCount, targetRole: payload.targetRole };
};
