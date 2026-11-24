import { NotificationService } from '../modules/notification/notification.service';

export const userRoom = (userId: string): string => `user_${userId}`;
export const sessionRoom = (sessionId: string): string => `session_${sessionId}`;

export function disconnectSessionSockets(sessionId: string): void {
  NotificationService.getIo()?.in(sessionRoom(sessionId)).disconnectSockets(true);
}

export function disconnectUserSockets(userId: string): void {
  NotificationService.getIo()?.in(userRoom(userId)).disconnectSockets(true);
}
