// Mock mínimo de expo-notifications para testes unitários

export const cancelAllScheduledNotificationsAsync = jest.fn(async () => {});
export const cancelScheduledNotificationAsync = jest.fn(async (_id: string) => {});
export const scheduleNotificationAsync = jest.fn(async () => "mock-notification-id");
export const setNotificationChannelAsync = jest.fn(async () => null);
export const getPermissionsAsync = jest.fn(async () => ({ status: "granted" }));
export const requestPermissionsAsync = jest.fn(async () => ({ status: "granted" }));

export const AndroidImportance = { LOW: 2, DEFAULT: 3, HIGH: 4 };
export const SchedulableTriggerInputTypes = { TIME_INTERVAL: "timeInterval", DATE: "date", DAILY: "daily" };
